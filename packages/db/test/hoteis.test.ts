// Aceite da A1 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - importar traz o hotel do staging para implantação, sem consumir licença;
//   - ativar consome licença e libera as UHs pendentes até o saldo de UHs;
//   - sem saldo: 409, com a tentativa na auditoria e licenca.sem_saldo no outbox;
//   - com a checagem da aplicação removida, a RLS ainda barra quem não é admin;
//   - duas ativações ao mesmo tempo com uma licença: uma passa, a outra não;
//   - a contagem de licença bate com licenca.uso() (a mesma do backoffice).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_WORKER, HK_TESTE_URL_INGESTAO, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeHoteis, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaHoteisDoStaging,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
const url = (v: string | undefined): string => {
  if (!v) throw new Error('URL de teste ausente.');
  return v;
};
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const T = {
  tenant: randomUUID(),
  admin: randomUUID(),
  gerente: randomUUID(),
  hotelDoGerente: randomUUID(),
};
const ctxAdmin = { usuarioId: T.admin, tenantId: T.tenant };
const ctxGerente = { usuarioId: T.gerente, tenantId: T.tenant };

describe.skipIf(!temBanco)('A1 — hotéis a partir do staging', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeHoteis>;
  /** Mesmo caso de uso, com a checagem de admin removida: sobra a RLS. */
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeHoteis>;

  const hotelPorCodigo = async (chave: string) =>
    (
      await dono.query<{ id: string; status: string }>(
        `select id, status from app.hotel where tenant_id = $1 and cod_externo = $2`,
        [T.tenant, chave],
      )
    ).rows[0];
  const contar = async (sql: string, params: unknown[]) =>
    Number((await dono.query<{ n: string }>(sql, params)).rows[0]?.n);

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const u of [T.admin, T.gerente]) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
    }
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A1')`, [T.tenant]);
    for (const u of [T.admin, T.gerente]) {
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, 'M', $3)`,
        [T.tenant, u, `${u}@hubkeep.invalid`],
      );
    }
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel do gerente', 'UTC', 'em_implantacao')`,
      [T.hotelDoGerente, T.tenant],
    );
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
         ($1, $3, $4, 'admin_grupo', 'grupo', null, $4),
         ($2, $3, $5, 'gerente_hotel', 'hotel', $6, $4)`,
      [randomUUID(), randomUUID(), T.tenant, T.admin, T.gerente, T.hotelDoGerente],
    );
    // Uma licença de hotel e uma de UH.
    await dono.query(
      `insert into licenca.contrato (tenant_id, max_hoteis, max_uhs, atualizado_por) values ($1, 1, 1, 'teste')`,
      [T.tenant],
    );
    for (const [chave, dados] of [
      ['H1', { nome: 'Hotel Um', fuso: 'America/Sao_Paulo' }],
      ['H2', { nome: 'Hotel Dois' }],
      ['H3', { nome: 'Hotel Três', fuso: 'America/Manaus' }],
    ] as const) {
      await dono.query(
        `insert into staging.registro_externo (tenant_id, fonte, entidade, chave, payload, hash)
         values ($1, 'totvs_cm', 'hotel', $2, $3, 'h')`,
        [T.tenant, chave, JSON.stringify(dados)],
      );
    }
    banco = await criarAcessoBanco({ app: { url: url(URL_APP), max: 4 } });
    const deps = {
      hoteis: criarPortaHoteisDoStaging(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeHoteis(deps);
    semChecagem = criarCasosDeUsoDeHoteis({ ...deps, podeAtivar: () => ({ permitido: true }) });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const tabela of [
      'staging.registro_externo',
      'app.evento_dominio',
      'app.auditoria',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'licenca.contrato',
      'app.membro',
    ]) {
      await dono.query(`delete from ${tabela} where tenant_id = $1`, [T.tenant]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [T.tenant]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [[T.admin, T.gerente]]);
  });

  it('lista o staging com o uso da licença', async () => {
    const { hoteis, uso } = await casos.listarParaAtivacao(ctxAdmin);
    expect(hoteis.map((h) => [h.chave, h.hotel])).toEqual([
      ['H1', null],
      ['H2', null],
      ['H3', null],
    ]);
    expect(uso).toEqual({
      hoteis: { contratados: 1, emUso: 0 },
      uhs: { contratadas: 1, emUso: 0 },
    });
  });

  it('importa para implantação, sem licença; repetir é 409; sem fuso é 422', async () => {
    const { hotelId } = await casos.importarHotel(ctxAdmin, { fonte: 'totvs_cm', chave: 'H1' });
    expect(await hotelPorCodigo('H1')).toEqual({ id: hotelId, status: 'em_implantacao' });
    await expect(
      casos.importarHotel(ctxAdmin, { fonte: 'totvs_cm', chave: 'H1' }),
    ).rejects.toMatchObject({ codigo: 'hotel_ja_importado' });
    await expect(
      casos.importarHotel(ctxAdmin, { fonte: 'totvs_cm', chave: 'H2' }),
    ).rejects.toMatchObject({ codigo: 'fuso_obrigatorio' });
    expect(
      await contar(
        `select count(*) as n from app.evento_dominio where tenant_id = $1 and tipo = 'hotel.criado' and registro_id = $2`,
        [T.tenant, hotelId],
      ),
    ).toBe(1);
  });

  it('ativa com saldo e libera as UHs pendentes até o saldo de UHs', async () => {
    const h1 = await hotelPorCodigo('H1');
    for (const nome of ['101', '102']) {
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values ($1, $2, $3, 'uh', $4, lower($4), 'pendente_licenca')`,
        [randomUUID(), T.tenant, h1?.id, nome],
      );
    }
    const r = await casos.ativarHotel(ctxAdmin, h1?.id ?? '');
    expect(r).toEqual({ hotelId: h1?.id, uhsLiberadas: 1, uhsPendentes: 1 });
    expect((await hotelPorCodigo('H1'))?.status).toBe('ativo');
    const status = await dono.query<{ nome: string; status: string }>(
      `select nome, status from app.local where hotel_id = $1 order by nome`,
      [h1?.id],
    );
    expect(status.rows).toEqual([
      { nome: '101', status: 'ativo' },
      { nome: '102', status: 'pendente_licenca' },
    ]);
    // A mesma contagem de licenca.uso(), que o backoffice lê.
    const uso = await dono.query<{ hoteis_ativos: string; uhs_ativas: string }>(
      `select hoteis_ativos, uhs_ativas from licenca.uso() where tenant_id = $1`,
      [T.tenant],
    );
    expect(uso.rows[0]).toEqual({ hoteis_ativos: '1', uhs_ativas: '1' });
    await expect(casos.ativarHotel(ctxAdmin, h1?.id ?? '')).rejects.toMatchObject({
      codigo: 'hotel_ja_ativo',
    });
  });

  it('sem saldo: 409, com a tentativa na auditoria e licenca.sem_saldo no outbox', async () => {
    const { hotelId } = await casos.importarHotel(ctxAdmin, {
      fonte: 'totvs_cm',
      chave: 'H2',
      fuso: 'Europe/Lisbon',
    });
    await expect(casos.ativarHotel(ctxAdmin, hotelId)).rejects.toMatchObject({
      codigo: 'licenca_hoteis_sem_saldo',
      parametros: { contratados: 1, emUso: 1 },
    });
    expect((await hotelPorCodigo('H2'))?.status).toBe('em_implantacao');
    expect(
      await contar(
        `select count(*) as n from app.auditoria where tenant_id = $1 and registro_id = $2 and acao = 'ativacao_bloqueada_sem_saldo'`,
        [T.tenant, hotelId],
      ),
    ).toBe(1);
    expect(
      await contar(
        `select count(*) as n from app.evento_dominio where tenant_id = $1 and tipo = 'licenca.sem_saldo' and registro_id = $2`,
        [T.tenant, hotelId],
      ),
    ).toBe(1);
  });

  it('com a checagem da aplicação removida, a RLS ainda barra o gerente', async () => {
    // O gerente não enxerga o staging: a importação não acha o hotel.
    await expect(
      semChecagem.importarHotel(ctxGerente, { fonte: 'totvs_cm', chave: 'H3' }),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado_no_staging' });
    // Direto na porta: criar hotel é recusado pela policy de INSERT...
    await expect(
      criarPortaHoteisDoStaging(banco).emSessao(ctxGerente, (s) =>
        s.criarHotel({ nome: 'X', fuso: 'UTC', fonte: 'totvs_cm', chave: 'H3' }),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // ...e ativar o próprio hotel não acha linha na policy de UPDATE.
    await expect(
      criarPortaHoteisDoStaging(banco).emSessao(ctxGerente, (s) => s.ativarHotel(T.hotelDoGerente)),
    ).rejects.toMatchObject({ codigo: 'sem_permissao' });
    expect(
      (await dono.query(`select status from app.hotel where id = $1`, [T.hotelDoGerente])).rows[0],
    ).toEqual({ status: 'em_implantacao' });
  });

  it('duas ativações ao mesmo tempo com uma licença livre: uma passa, a outra recebe 409', async () => {
    await dono.query(`update licenca.contrato set max_hoteis = 2 where tenant_id = $1`, [T.tenant]);
    const { hotelId: h3 } = await casos.importarHotel(ctxAdmin, { fonte: 'totvs_cm', chave: 'H3' });
    const h2 = (await hotelPorCodigo('H2'))?.id ?? '';
    const resultados = await Promise.allSettled([
      casos.ativarHotel(ctxAdmin, h2),
      casos.ativarHotel(ctxAdmin, h3),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const recusa = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(recusa.reason).toMatchObject({ codigo: 'licenca_hoteis_sem_saldo' });
    expect(
      await contar(
        `select count(*) as n from app.hotel where tenant_id = $1 and status = 'ativo'`,
        [T.tenant],
      ),
    ).toBe(2);
  });
});
