// Aceite da A5 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - o Implantador vigente vê o painel do hotel dele, com locais, papéis e
//     pendências, e cadastra pessoas abaixo do próprio papel no hotel dele;
//   - concessão acima do próprio papel ou em outro hotel é 403 com código, e
//     ativar hotel é só do Admin;
//   - implantador vencido e gerente não veem o painel; com a checagem
//     removida, a RLS ainda esconde o hotel de outro escopo;
//   - o tempo de implantação sai da auditoria do hotel (PB1, sem migração).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeImplantacao,
  criarCasosDeUsoDePapeis,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import { podeAtivarHotel } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaImplantacao,
  criarPortaMembros,
  criarPortasDeAplicacao,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const H1 = randomUUID();
const H2 = randomUUID();
const U = {
  admin: randomUUID(),
  implantador: randomUUID(),
  vencido: randomUUID(),
  gerenteH2: randomUUID(),
  tecnico: randomUUID(),
  antigo: randomUUID(),
  novo: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('A5 — Implantador e painel de implantação', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let painel: ReturnType<typeof criarCasosDeUsoDeImplantacao>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeImplantacao>;
  let papeis: ReturnType<typeof criarCasosDeUsoDePapeis>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A5')`, [TENANT]);
    for (const [id, nome] of [
      [H1, 'Hotel 1'],
      [H2, 'Hotel 2'],
    ]) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'UTC', 'em_implantacao')`,
        [id, TENANT, nome],
      );
    }
    for (const [tipo, status, nome] of [
      ['uh', 'ativo', 'UH 101'],
      ['uh', 'ativo', 'UH 102'],
      ['uh', 'pendente_licenca', 'UH 103'],
      ['area_comum', 'ativo', 'Piscina'],
    ]) {
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values ($1, $2, $3, $4, $5, lower($5), $6)`,
        [randomUUID(), TENANT, H1, tipo, nome, status],
      );
    }
    for (const [nome, id] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, id, nome, `${id}@hubkeep.invalid`],
      );
    }
    const atribuir = (
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      extra = '',
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por, valido_ate, revogado_em, revogado_por)
         values ($1, $2, $3, $4, $5, $6, $7, ${extra || 'null, null, null'})`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(
      U.implantador,
      'implantador',
      'hotel',
      H1,
      `now() + interval '30 days', null, null`,
    );
    await atribuir(U.vencido, 'implantador', 'hotel', H1, `now() - interval '1 day', null, null`);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.antigo, 'tecnico', 'hotel', H1, `null, now() - interval '1 day', $7`);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const portas = criarPortasDeAplicacao(banco);
    const deps = {
      implantacao: criarPortaImplantacao(banco),
      membros: criarPortaMembros(banco),
      atribuicoes: portas.atribuicoes,
      relogio: relogioDoSistema,
    };
    painel = criarCasosDeUsoDeImplantacao(deps);
    semChecagem = criarCasosDeUsoDeImplantacao({ ...deps, podeVer: () => ({ permitido: true }) });
    papeis = criarCasosDeUsoDePapeis({ ...portas, relogio: relogioDoSistema });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.atribuicao_escopo',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('o Implantador vê o painel do hotel dele', async () => {
    const p = await painel.painel(ctx(U.implantador), H1);
    expect(p.hotel).toMatchObject({
      nome: 'Hotel 1',
      status: 'em_implantacao',
      modeloContratual: null,
    });
    expect(p.locais).toEqual({ uhsAtivas: 2, uhsPendentes: 1, areasComuns: 1, inativos: 0 });
    expect(p.papeis).toEqual([
      { papel: 'implantador', pessoas: 1 },
      { papel: 'tecnico', pessoas: 1 },
    ]);
    expect(p.pessoasSemPapelVigente.map((x) => x.nome).sort()).toEqual(['antigo', 'vencido']);
    expect(p.ativos).toEqual({
      ativos: 0,
      semCategoria: 0,
      locaisSemAtivo: 4,
      comModeloSemPlano: 0,
    });
    expect(p.pendencias).toEqual([
      'modelo_contratual_nao_informado',
      'uhs_pendentes_de_licenca',
      'locais_sem_ativo',
      'sem_gerente',
      'pessoas_sem_papel_vigente',
    ]);
  });

  it('cadastra o gerente do hotel dele e o painel reflete', async () => {
    await papeis.concederPapel(ctx(U.implantador), {
      usuarioId: U.novo,
      papel: 'gerente_hotel',
      escopo: { tipo: 'hotel', hotelId: H1 },
    });
    const p = await painel.painel(ctx(U.implantador), H1);
    expect(p.pendencias).not.toContain('sem_gerente');
    expect(p.papeis).toContainEqual({ papel: 'gerente_hotel', pessoas: 1 });
  });

  it('acima do próprio papel ou fora do hotel dele: 403 com código; ativar é do Admin', async () => {
    await expect(
      papeis.concederPapel(ctx(U.implantador), {
        usuarioId: U.novo,
        papel: 'implantador',
        escopo: { tipo: 'hotel', hotelId: H1 },
        validoAte: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toMatchObject({ codigo: 'implantador_nao_concede_papel' });
    await expect(
      papeis.concederPapel(ctx(U.implantador), {
        usuarioId: U.novo,
        papel: 'tecnico',
        escopo: { tipo: 'hotel', hotelId: H2 },
      }),
    ).rejects.toMatchObject({ codigo: 'nao_e_implantador_no_hotel' });
    await expect(
      papeis.concederPapel(ctx(U.vencido), {
        usuarioId: U.novo,
        papel: 'tecnico',
        escopo: { tipo: 'hotel', hotelId: H1 },
      }),
    ).rejects.toMatchObject({
      codigo: expect.stringMatching(
        /^(nao_e_implantador_no_hotel|concessao_so_admin_ou_implantador)$/,
      ),
    });
    const minhas = await criarPortasDeAplicacao(banco).atribuicoes.doUsuario(ctx(U.implantador));
    const r = podeAtivarHotel(minhas, new Date());
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('ativacao_so_admin');
  });

  it('vencido e gerente não veem; sem a checagem, a RLS esconde o hotel', async () => {
    await expect(painel.painel(ctx(U.vencido), H1)).rejects.toMatchObject({
      codigo: 'implantacao_fora_do_escopo',
    });
    await expect(painel.painel(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'implantacao_fora_do_escopo',
    });
    await expect(semChecagem.painel(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    await expect(semChecagem.painel(ctx(U.vencido), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });

  it('com o modelo contratual informado, a pendência some (I2)', async () => {
    await dono.query(`update app.hotel set modelo_contratual = 'administrado' where id = $1`, [H1]);
    const p = await painel.painel(ctx(U.implantador), H1);
    expect(p.hotel.modeloContratual).toBe('administrado');
    expect(p.pendencias).not.toContain('modelo_contratual_nao_informado');
  });

  it('o tempo de implantação sai da auditoria do hotel (PB1)', async () => {
    const { rows } = await dono.query(`select criado_em from app.hotel where id = $1`, [H1]);
    const criadoEm = new Date(rows[0].criado_em);
    const emCurso = await painel.painel(ctx(U.implantador), H1);
    expect(emCurso.tempo).toMatchObject({ entrouEm: criadoEm, prontoEm: null });
    expect(emCurso.tempo.duracaoMs).toBeGreaterThanOrEqual(0);

    // A entrada e a ativação como as grava o repositório de hotéis.
    const entrou = new Date(Date.now() - 30 * 3_600_000);
    const pronto = new Date(Date.now() - 10 * 3_600_000);
    for (const [acao, status, em] of [
      ['importar_do_sistema_hoteleiro', 'em_implantacao', entrou],
      ['ativar', 'ativo', pronto],
    ] as const) {
      await dono.query(
        `insert into app.auditoria (id, tenant_id, usuario_id, entidade, registro_id, acao, hotel_id, depois, em)
         values ($1, $2, $3, 'hotel', $4, $5, $4, jsonb_build_object('status', $6::text), $7)`,
        [randomUUID(), TENANT, U.admin, H1, acao, status, em],
      );
    }
    await dono.query(`update app.hotel set status = 'ativo' where id = $1`, [H1]);
    const p = await painel.painel(ctx(U.implantador), H1);
    expect(p.tempo).toEqual({
      entrouEm: entrou,
      prontoEm: pronto,
      duracaoMs: 20 * 3_600_000,
      dentroDaMeta: true,
    });
  });
});
