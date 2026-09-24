// Aceite da F0-04, contra um Postgres real com as migrações e os papéis
// configurados (na CI: o Supabase do runner, depois de db:papeis). Sem banco na
// máquina de desenvolvimento (ADR-015), a suíte é pulada — exceto quando
// HK_EXIGIR_BANCO=1, como na CI, em que a ausência de URL é falha.
//
//   HK_TESTE_URL_APP     hk_app
//   HK_TESTE_URL_WORKER  hk_worker
//   HK_TESTE_URL_DONO    postgres (fixtures e conferência do que foi gravado)
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AcessoBanco, criarAcessoBanco, criarBandeira } from '../src/index';
import { criarKysely, criarPool, emTransacao } from '../src/conexao';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_WORKER && URL_DONO);
/** Só chamado dentro da suíte, que é pulada quando falta URL. */
const url = (v: string | undefined): string => {
  if (!v) throw new Error('URL de teste ausente.');
  return v;
};
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/WORKER/DONO.');
}

// Ids novos a cada execução: nada colide com outra rodada nem com dado do dev.
const A = { tenant: randomUUID(), usuario: randomUUID(), hotel: randomUUID() };
const B = { tenant: randomUUID(), usuario: randomUUID(), hotel: randomUUID() };
const ctxA = { usuarioId: A.usuario, tenantId: A.tenant };

describe.skipIf(!temBanco)('packages/db contra Postgres real', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;

  const semear = async (t: typeof A, nome: string) => {
    await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
      t.usuario,
      `${t.usuario}@hubkeep.invalid`,
    ]);
    await dono.query(`insert into app.tenant (id, nome) values ($1, $2)`, [t.tenant, nome]);
    await dono.query(
      `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
      [t.tenant, t.usuario, `Admin ${nome}`, `${t.usuario}@hubkeep.invalid`],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $2, $3, 'America/Sao_Paulo', 'ativo')`,
      [t.hotel, t.tenant, `Hotel ${nome}`],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, concedido_por)
       values ($1, $2, $3, 'admin_grupo', 'grupo', $3)`,
      [randomUUID(), t.tenant, t.usuario],
    );
  };

  const limpar = async () => {
    const tenants = [A.tenant, B.tenant];
    for (const tabela of [
      'app.evento_dominio',
      'app.auditoria',
      'app.bandeira',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${tabela} where tenant_id = any($1::uuid[])`, [tenants]);
    }
    await dono.query(`delete from app.tenant where id = any($1::uuid[])`, [tenants]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[A.usuario, B.usuario]]);
  };

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await semear(A, 'A');
    await semear(B, 'B');
    // max 2: força que as 40 requisições abaixo disputem e reusem as mesmas conexões.
    banco = criarAcessoBanco({
      app: { url: url(URL_APP), max: 2 },
      worker: { url: url(URL_WORKER), max: 1 },
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (dono) {
      await limpar();
      await dono.end();
    }
  });

  it('requisições concorrentes de tenants diferentes no mesmo pool não vazam contexto', async () => {
    const rodadas = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? A : B));
    const pids = new Set<number>();
    const resultados = await Promise.all(
      rodadas.map((t) =>
        banco.withContext({ usuarioId: t.usuario, tenantId: t.tenant }, async (tx) => {
          const r = await sql<{ tenant: string; usuario: string; pid: number }>`
            select current_setting('app.tenant_id') as tenant,
                   current_setting('app.usuario_id') as usuario,
                   pg_backend_pid() as pid,
                   pg_sleep(random() * 0.02)`.execute(tx);
          const hoteis = await tx.selectFrom('app.hotel').select('id').execute();
          const [linha] = r.rows;
          if (!linha) throw new Error('consulta de contexto sem linha');
          pids.add(linha.pid);
          return { esperado: t, linha, hoteis: hoteis.map((h) => h.id) };
        }),
      ),
    );
    for (const { esperado, linha, hoteis } of resultados) {
      expect(linha.tenant).toBe(esperado.tenant);
      expect(linha.usuario).toBe(esperado.usuario);
      expect(hoteis).toEqual([esperado.hotel]);
    }
    // Prova de que houve reuso: 40 transações em no máximo 2 conexões do pool.
    expect(pids.size).toBeLessThanOrEqual(2);
  });

  it('consulta sem contexto retorna vazio, inclusive na conexão que acabou de ter contexto', async () => {
    const pool = criarPool({ url: url(URL_APP), max: 1 });
    try {
      const db = criarKysely(pool);
      const comContexto = await emTransacao(db, A.usuario, A.tenant, (tx) =>
        tx.selectFrom('app.hotel').select('id').execute(),
      );
      expect(comContexto.map((h) => h.id)).toEqual([A.hotel]); // controle: há dado visível

      // Mesma e única conexão, agora sem transação nem contexto.
      const r = await pool.query(
        `select (select count(*) from app.hotel)::int as hoteis,
                coalesce(current_setting('app.tenant_id', true), '') as tenant`,
      );
      expect(r.rows[0]).toEqual({ hoteis: 0, tenant: '' });
    } finally {
      await pool.end();
    }
  });

  it('tenant forjado (usuário que não é membro dele) não vê nada', async () => {
    const hoteis = await banco.withContext({ usuarioId: A.usuario, tenantId: B.tenant }, (tx) =>
      tx.selectFrom('app.hotel').select('id').execute(),
    );
    expect(hoteis).toEqual([]);
  });

  it('recusa contexto malformado antes de abrir transação', async () => {
    await expect(
      banco.withContext({ usuarioId: 'nao-e-uuid', tenantId: A.tenant }, async () => 1),
    ).rejects.toThrow(/usuarioId não é um UUID/);
  });

  it('unit of work grava mudança, auditoria e evento na mesma transação', async () => {
    const bandeira = await banco.executar(ctxA, (uow) => criarBandeira(uow, 'Bandeira UoW'));

    const b = await dono.query(`select tenant_id, nome from app.bandeira where id = $1`, [
      bandeira.id,
    ]);
    const a = await dono.query(
      `select tenant_id, usuario_id, entidade, acao, depois from app.auditoria where registro_id = $1`,
      [bandeira.id],
    );
    const e = await dono.query(
      `select tenant_id, tipo, payload from app.evento_dominio where registro_id = $1`,
      [bandeira.id],
    );
    expect(b.rows).toEqual([{ tenant_id: A.tenant, nome: 'Bandeira UoW' }]);
    expect(a.rows).toEqual([
      {
        tenant_id: A.tenant,
        usuario_id: A.usuario,
        entidade: 'bandeira',
        acao: 'criar',
        depois: bandeira,
      },
    ]);
    expect(e.rows).toEqual([{ tenant_id: A.tenant, tipo: 'bandeira.criada', payload: bandeira }]);
  });

  it('erro no caso de uso desfaz mudança, auditoria e evento juntos', async () => {
    let id = '';
    await expect(
      banco.executar(ctxA, async (uow) => {
        id = (await criarBandeira(uow, 'Bandeira que não fica')).id;
        throw new Error('falha depois da escrita');
      }),
    ).rejects.toThrow('falha depois da escrita');

    expect(id).not.toBe('');
    const contagem = await dono.query(
      `select (select count(*) from app.bandeira where id = $1)::int as bandeira,
              (select count(*) from app.auditoria where registro_id = $1)::int as auditoria,
              (select count(*) from app.evento_dominio where registro_id = $1)::int as evento`,
      [id],
    );
    expect(contagem.rows[0]).toEqual({ bandeira: 0, auditoria: 0, evento: 0 });
  });

  it('falha ao gravar a auditoria também desfaz a mudança', async () => {
    let id = '';
    // hotelId de outro tenant: a policy de INSERT da auditoria recusa, e a
    // bandeira, já gravada na mesma transação, tem de ir junto.
    await expect(
      banco.executar(ctxA, async (uow) => {
        id = (await criarBandeira(uow, 'Bandeira com auditoria inválida')).id;
        uow.auditar({ entidade: 'bandeira', registroId: id, acao: 'teste', hotelId: B.hotel });
      }),
    ).rejects.toThrow();

    const r = await dono.query(`select count(*)::int as n from app.bandeira where id = $1`, [id]);
    expect(r.rows[0]).toEqual({ n: 0 });
  });

  it('job do sistema: vê só o próprio tenant e audita sem usuário', async () => {
    const hoteis = await banco.withSistema({ tenantId: A.tenant }, (tx) =>
      tx
        .selectFrom('app.hotel')
        .select('id')
        .where('tenant_id', 'in', [A.tenant, B.tenant])
        .execute(),
    );
    expect(hoteis.map((h) => h.id)).toEqual([A.hotel]);

    const registroId = randomUUID();
    await banco.executarComoSistema({ tenantId: A.tenant }, async (uow) => {
      uow.auditar({ entidade: 'job', registroId, acao: 'executar' });
      uow.publicar({ tipo: 'job.executado', entidade: 'job', registroId, payload: {} });
    });
    const a = await dono.query(
      `select tenant_id, usuario_id from app.auditoria where registro_id = $1`,
      [registroId],
    );
    const e = await dono.query(`select tenant_id from app.evento_dominio where registro_id = $1`, [
      registroId,
    ]);
    expect(a.rows).toEqual([{ tenant_id: A.tenant, usuario_id: null }]);
    expect(e.rows).toEqual([{ tenant_id: A.tenant }]);
  });
});
