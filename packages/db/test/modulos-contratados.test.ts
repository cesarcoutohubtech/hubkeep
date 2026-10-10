// I7 contra Postgres real (na CI, o Supabase do runner): as políticas de um
// módulo valem só para o tenant com o módulo vigente (adendo ao ADR-026 de
// 10/10/2026).
//   - sem o módulo, gravar inteligencia.* é politica_desconhecida;
//   - com o módulo vigente (gravado como hk_backoffice, como o script de
//     operação), grava; outro tenant continua sem;
//   - vencido, volta a politica_desconhecida, e o valor gravado fica no banco,
//     sem efeito;
//   - quem não tem papel vigente no tenant não lê licenca.modulo: o registro
//     é o do núcleo (falha fechada).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeConfiguracao,
  criarPoliticasDoTenant,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaConfiguracao,
  criarPortaModulos,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const A = randomUUID();
const B = randomUUID();
const U = { adminA: randomUUID(), adminB: randomUUID(), semPapelA: randomUUID() };
const ctx = (usuarioId: string, tenantId: string) => ({ usuarioId, tenantId });
const CHAVE = 'inteligencia.teste';
const GRUPO = { tipo: 'grupo' } as const;
const DIA = 24 * 60 * 60 * 1000;

// Uma extensão de mentira com o prefixo do módulo: o pacote db não importa o Intelligence.
const registros = registrosDePoliticasPorModulo([
  {
    modulo: 'inteligencia',
    extensao: {
      prefixo: 'inteligencia.',
      chaves: [CHAVE],
      padrao: () => ({ n: 1 }),
      valido: (_c, v) =>
        typeof v === 'object' &&
        v !== null &&
        Object.keys(v).length === 1 &&
        Number.isInteger((v as { n?: unknown }).n),
    },
  },
]);

describe.skipIf(!temBanco)('I7 — políticas por módulo contratado', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeConfiguracao>;
  let modulos: ReturnType<typeof criarPortaModulos>;

  /** Como o script de operação: hk_backoffice, numa transação. */
  const comoBackoffice = async (texto: string, params: unknown[]) => {
    await dono.query('begin');
    try {
      await dono.query('set local role hk_backoffice');
      await dono.query(texto, params);
      await dono.query('commit');
    } catch (e) {
      await dono.query('rollback');
      throw e;
    }
  };

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [tenant, nome] of [
      [A, 'Grupo I7 A'],
      [B, 'Grupo I7 B'],
    ] as const) {
      await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [tenant, nome]);
    }
    for (const [nome, id] of Object.entries(U)) {
      const tenant = id === U.adminB ? B : A;
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [tenant, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    for (const [tenant, usuario] of [
      [A, U.adminA],
      [B, U.adminB],
    ] as const) {
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, 'admin_grupo', 'grupo', null, $3)`,
        [randomUUID(), tenant, usuario],
      );
    }
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    modulos = criarPortaModulos(banco);
    casos = criarCasosDeUsoDeConfiguracao({
      configuracao: criarPortaConfiguracao(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
      politicas: criarPoliticasDoTenant({ registros, modulos, relogio: relogioDoSistema }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.politica',
      'licenca.modulo',
      'app.atribuicao_escopo',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = any($1::uuid[])`, [[A, B]]);
    }
    await dono.query(`delete from app.tenant where id = any($1::uuid[])`, [[A, B]]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  const gravar = (usuario: string, tenant: string, valor: unknown) =>
    casos.gravarPolitica(ctx(usuario, tenant), CHAVE, GRUPO, valor);

  it('sem o módulo: a chave do módulo não existe; a do núcleo, sim', async () => {
    expect(await modulos.contratados(ctx(U.adminA, A))).toEqual([]);
    await expect(gravar(U.adminA, A, { n: 2 })).rejects.toMatchObject({
      codigo: 'politica_desconhecida',
    });
    await casos.gravarPolitica(ctx(U.adminA, A), 'os.codigos_obrigatorios', GRUPO, {
      ligado: true,
    });
  });

  it('com o módulo vigente: grava; o outro tenant continua sem', async () => {
    const inicio = new Date(Date.now() - DIA);
    await comoBackoffice(
      `insert into licenca.modulo (id, tenant_id, modulo, inicio, fim, atualizado_por)
       values ($1, $2, 'inteligencia', $3, null, 'teste da I7')`,
      [randomUUID(), A, inicio],
    );
    const lidos = await modulos.contratados(ctx(U.adminA, A));
    expect(lidos).toEqual([{ modulo: 'inteligencia', inicio, fim: null }]);
    expect(lidos[0]?.inicio).toBeInstanceOf(Date);

    await gravar(U.adminA, A, { n: 2 });
    await expect(gravar(U.adminA, A, { n: 'x' })).rejects.toMatchObject({
      codigo: 'politica_valor_invalido',
    });
    await expect(gravar(U.adminB, B, { n: 2 })).rejects.toMatchObject({
      codigo: 'politica_desconhecida',
    });
    expect(await modulos.contratados(ctx(U.adminB, B))).toEqual([]);
  });

  it('quem não tem papel vigente no tenant não lê o módulo (falha fechada)', async () => {
    expect(await modulos.contratados(ctx(U.semPapelA, A))).toEqual([]);
  });

  it('vencido: volta a politica_desconhecida, e o valor gravado fica sem efeito', async () => {
    await comoBackoffice(
      `update licenca.modulo set fim = $2, atualizado_em = now(), atualizado_por = 'teste da I7'
       where tenant_id = $1 and modulo = 'inteligencia'`,
      [A, new Date(Date.now() - 1000)],
    );
    await expect(gravar(U.adminA, A, { n: 3 })).rejects.toMatchObject({
      codigo: 'politica_desconhecida',
    });
    // Nem volta a herdar: a chave não existe para o tenant.
    await expect(gravar(U.adminA, A, null)).rejects.toMatchObject({
      codigo: 'politica_desconhecida',
    });
    const { rows } = await dono.query(
      `select valor from app.politica where tenant_id = $1 and chave = $2 and ativa`,
      [A, CHAVE],
    );
    expect(rows.map((r) => r.valor)).toEqual([{ n: 2 }]);
  });
});
