// P1b sem banco: o BEGIN leva o contexto no mesmo envio, e o escopo de leitura
// junta as leituras de um pedido numa transação. O pool é falso e registra o
// que seria enviado ao Postgres; o Kysely e o driver são os reais.
import { sql } from 'kysely';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { montarAcesso } from '../src/acesso';
import { criarKysely, emTransacao, inicioComContexto } from '../src/conexao';
import { emEscopoDeLeitura } from '../src/escopo-de-leitura';

const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT = '10000000-0000-4000-8000-000000000001';
const OUTRO_TENANT = '10000000-0000-4000-8000-000000000002';
const ctx = { usuarioId: USUARIO, tenantId: TENANT };

interface Envio {
  conexao: number;
  sql: string;
  parametros: unknown[];
}

/** Pool do pg falso: cada connect() é uma conexão nova numerada. */
function poolFalso(opcoes: { falharEm?: RegExp } = {}) {
  const envios: Envio[] = [];
  let conexoes = 0;
  const pool = {
    options: {},
    async connect() {
      const conexao = ++conexoes;
      return {
        async query(texto: string, parametros: unknown[]) {
          envios.push({ conexao, sql: texto, parametros });
          if (opcoes.falharEm?.test(texto)) {
            throw Object.assign(new Error('falha simulada'), { code: 'XX000' });
          }
          return { command: 'SELECT', rowCount: 1, rows: [{ ok: 1 }] };
        },
        release() {},
      };
    },
    async end() {},
  };
  return { pool: pool as unknown as pg.Pool, envios, conexoes: () => conexoes };
}

const comandos = (envios: Envio[]) => envios.map((e) => e.sql);
const ler = (tx: Parameters<Parameters<typeof emTransacao>[3]>[0]) =>
  sql`select 1 as ok`.execute(tx);

const inicioEsperado = (inicio: string, tenant = TENANT) =>
  `${inicio}; select set_config('app.usuario_id', '${USUARIO}', true), ` +
  `set_config('app.tenant_id', '${tenant}', true)`;

describe('inicioComContexto', () => {
  it('junta o BEGIN e os dois set_config locais num comando', () => {
    expect(inicioComContexto({}, USUARIO, TENANT)).toBe(inicioEsperado('begin'));
  });

  it('leva o modo de acesso e o isolamento como o driver do Kysely', () => {
    expect(inicioComContexto({ accessMode: 'read only' }, USUARIO, TENANT)).toBe(
      inicioEsperado('start transaction read only'),
    );
    expect(
      inicioComContexto(
        { isolationLevel: 'serializable', accessMode: 'read write' },
        USUARIO,
        TENANT,
      ),
    ).toMatch(/^start transaction isolation level serializable read write; select /);
  });

  it('aceita contexto vazio (worker, ingestão e a lista de tenants)', () => {
    expect(inicioComContexto({}, '', '')).toBe(
      "begin; select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)",
    );
  });

  it('recusa qualquer valor que não seja UUID: não há como injetar SQL no literal', () => {
    expect(() => inicioComContexto({}, "x', true); drop table app.hotel; --", TENANT)).toThrow(
      /usuarioId não é um UUID/,
    );
    expect(() => inicioComContexto({}, USUARIO, `${TENANT}'`)).toThrow(/tenantId não é um UUID/);
  });
});

describe('emTransacao: BEGIN e contexto numa ida e volta', () => {
  it('manda início com contexto, a consulta e o COMMIT: três envios numa conexão', async () => {
    const { pool, envios } = poolFalso();
    await emTransacao(criarKysely(pool), USUARIO, TENANT, ler);
    expect(comandos(envios)).toEqual([inicioEsperado('begin'), 'select 1 as ok', 'commit']);
    // Sem parâmetros: protocolo simples, o único que aceita dois comandos por envio.
    expect(envios[0]?.parametros).toEqual([]);
    expect(new Set(envios.map((e) => e.conexao)).size).toBe(1);
  });

  it('erro no meio desfaz a transação', async () => {
    const { pool, envios } = poolFalso();
    await expect(
      emTransacao(criarKysely(pool), USUARIO, TENANT, async () => {
        throw new Error('caso de uso falhou');
      }),
    ).rejects.toThrow('caso de uso falhou');
    expect(comandos(envios)).toEqual([inicioEsperado('begin'), 'rollback']);
  });

  it('falha no início com contexto ainda manda ROLLBACK, e nada mais roda', async () => {
    const { pool, envios } = poolFalso({ falharEm: /set_config/ });
    await expect(emTransacao(criarKysely(pool), USUARIO, TENANT, ler)).rejects.toThrow(
      'falha simulada',
    );
    expect(comandos(envios)).toEqual([inicioEsperado('begin'), 'rollback']);
  });

  it('contexto malformado é recusado antes de pegar conexão', async () => {
    const { pool, conexoes } = poolFalso();
    await expect(emTransacao(criarKysely(pool), 'nao-e-uuid', TENANT, ler)).rejects.toThrow(
      /usuarioId não é um UUID/,
    );
    expect(conexoes()).toBe(0);
  });
});

describe('escopo de leitura: uma transação por pedido', () => {
  const montar = (opcoes?: { falharEm?: RegExp }) => {
    const falso = poolFalso(opcoes);
    const banco = montarAcesso({ app: criarKysely(falso.pool), worker: null, ingestao: null });
    return { ...falso, banco };
  };

  it('sem escopo, cada withContext abre a própria transação', async () => {
    const { banco, envios } = montar();
    await Promise.all([banco.withContext(ctx, ler), banco.withContext(ctx, ler)]);
    expect(comandos(envios).filter((c) => c.startsWith('begin;'))).toHaveLength(2);
    expect(comandos(envios).filter((c) => c === 'commit')).toHaveLength(2);
  });

  it('no escopo, leituras em paralelo com o mesmo contexto dividem uma transação somente leitura', async () => {
    const { banco, envios, conexoes } = montar();
    const resultados = await emEscopoDeLeitura(() =>
      Promise.all([
        banco.withContext(ctx, ler),
        banco.withContext(ctx, ler),
        banco.withContext(ctx, ler),
      ]),
    );
    expect(resultados).toHaveLength(3);
    expect(comandos(envios)).toEqual([
      inicioEsperado('start transaction read only'),
      'select 1 as ok',
      'select 1 as ok',
      'select 1 as ok',
      'commit',
    ]);
    expect(conexoes()).toBe(1);
  });

  it('o COMMIT só sai quando o escopo termina', async () => {
    const { banco, envios } = montar();
    await emEscopoDeLeitura(async () => {
      await banco.withContext(ctx, ler);
      expect(comandos(envios)).not.toContain('commit');
      await banco.withContext(ctx, ler);
    });
    expect(comandos(envios).at(-1)).toBe('commit');
  });

  it('contexto diferente no mesmo escopo nunca reusa a transação', async () => {
    const { banco, envios } = montar();
    await emEscopoDeLeitura(async () => {
      await banco.withContext(ctx, ler);
      await banco.withContext({ usuarioId: USUARIO, tenantId: OUTRO_TENANT }, ler);
    });
    expect(comandos(envios)).toEqual([
      inicioEsperado('start transaction read only'),
      'select 1 as ok',
      inicioEsperado('begin', OUTRO_TENANT),
      'select 1 as ok',
      'commit',
      'commit',
    ]);
  });

  it('executar (unit of work) não entra no escopo: abre transação de leitura e escrita própria', async () => {
    const { banco, envios, conexoes } = montar();
    await emEscopoDeLeitura(async () => {
      await banco.withContext(ctx, ler);
      await banco.executar(ctx, async () => 'gravado');
    });
    expect(comandos(envios)).toContain(inicioEsperado('begin'));
    expect(conexoes()).toBe(2);
  });

  it('erro numa leitura descarta o escopo: a seguinte abre a própria, e o escopo desfaz no fim', async () => {
    const { banco, envios } = montar({ falharEm: /from_falha/ });
    await emEscopoDeLeitura(async () => {
      await expect(
        banco.withContext(ctx, (tx) => sql`select 1 from_falha`.execute(tx)),
      ).rejects.toThrow('falha simulada');
      await banco.withContext(ctx, ler);
    });
    expect(comandos(envios)).toEqual([
      inicioEsperado('start transaction read only'),
      'select 1 from_falha',
      inicioEsperado('begin'),
      'select 1 as ok',
      'commit',
      'commit',
    ]);
  });

  it('pedido que falha desfaz a transação do escopo e devolve o erro do pedido', async () => {
    const { banco, envios } = montar();
    await expect(
      emEscopoDeLeitura(async () => {
        await banco.withContext(ctx, ler);
        throw new Error('handler falhou');
      }),
    ).rejects.toThrow('handler falhou');
    expect(comandos(envios).at(-1)).toBe('rollback');
  });

  it('escopo sem leitura não abre conexão', async () => {
    const { conexoes } = montar();
    expect(await emEscopoDeLeitura(async () => 42)).toBe(42);
    expect(conexoes()).toBe(0);
  });

  it('leitura depois do fim do escopo abre a própria transação', async () => {
    const { banco, envios } = montar();
    await emEscopoDeLeitura(async () => {
      await banco.withContext(ctx, ler);
    });
    await banco.withContext(ctx, ler);
    expect(comandos(envios).slice(-3)).toEqual([
      inicioEsperado('begin'),
      'select 1 as ok',
      'commit',
    ]);
  });
});
