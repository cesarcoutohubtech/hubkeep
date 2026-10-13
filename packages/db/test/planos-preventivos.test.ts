// Planos preventivos (fase 1b, PV2; ADR-041) contra Postgres real (na CI, o
// Supabase do runner):
//   - o Gerente cadastra o plano do ativo, pausado; a lista do hotel e a do
//     ativo trazem a próxima data; a auditoria e o evento ficam gravados;
//   - altera pela versão (a velha dá conflito), ativa com o responsável,
//     pausa e encerra; o encerrado não muda mais;
//   - o Implantador do hotel cadastra o plano por categoria, já ativo, com a
//     equipe (decisão 8);
//   - o Técnico não lê nem grava plano: a regra recusa e, sem ela, a RLS
//     também; o Gerente de outro hotel não vê o plano.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDePlanosPreventivos, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaPlanosPreventivos,
  criarPortaTriagem,
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
const UH1 = randomUUID();
const UH2 = randomUUID();
const ATIVO1 = randomUUID();
const ATIVO2 = randomUUID();
const CATEGORIA = randomUUID();
const EQUIPE = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  implantador: randomUUID(),
  tecnico: randomUUID(),
  gerenteH2: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

const pedido = {
  nome: 'Limpeza do filtro',
  intervalo: 1,
  unidade: 'mes',
  inicio: '2026-01-31',
  checklistModeloId: null,
  tecnicoId: null,
  equipeId: null,
};

describe.skipIf(!temBanco)('PV2 — planos preventivos', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let planos: ReturnType<typeof criarCasosDeUsoDePlanosPreventivos>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDePlanosPreventivos>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo PV2')`, [TENANT]);
    for (const [hotel, uh, ativo, nome] of [
      [H1, UH1, ATIVO1, 'Hotel 1'],
      [H2, UH2, ATIVO2, 'Hotel 2'],
    ] as const) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status)
         values ($1, $2, $3, 'America/Sao_Paulo', 'ativo')`,
        [hotel, TENANT, nome],
      );
      await dono.query(
        `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
         values ($1, $2, $3, 'uh', 'UH 101', 'uh 101', 'ativo')`,
        [uh, TENANT, hotel],
      );
      await dono.query(
        `insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca)
         values ($1, $2, $3, $4, $5, 'Split', 'split')`,
        [hotel === H1 ? 'P000000001' : 'P000000002', ativo, TENANT, hotel, uh],
      );
    }
    await dono.query(
      `insert into app.categoria_ativo (id, tenant_id, chave_padrao) values ($1, $2, 'ar_condicionado')`,
      [CATEGORIA, TENANT],
    );
    await dono.query(
      `insert into app.equipe (id, tenant_id, hotel_id, nome) values ($1, $2, $3, 'Manutenção')`,
      [EQUIPE, TENANT, H1],
    );
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
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por, valido_ate)
         values ($1, $2, $3, $4::app.papel, $5, $6, $7,
                 case when $4::app.papel = 'implantador' then now() + interval '30 days' end)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.implantador, 'implantador', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const deps = {
      planos: criarPortaPlanosPreventivos(banco),
      triagem: criarPortaTriagem(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    planos = criarCasosDeUsoDePlanosPreventivos(deps);
    // Sem a regra do domínio: só a RLS decide.
    semRegra = criarCasosDeUsoDePlanosPreventivos({
      ...deps,
      podeGerir: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.plano_preventivo',
      'app.equipe',
      'app.ativo',
      'app.categoria_ativo',
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

  let planoId = '';

  it('o Gerente cadastra o plano do ativo, pausado, com auditoria e evento', async () => {
    const criado = await planos.criar(ctx(U.gerente), H1, {
      ...pedido,
      ativoId: ATIVO1,
      categoriaId: null,
      ativar: false,
    });
    planoId = criado.id;
    expect(criado.versao).toBe(1);
    const lista = await planos.doHotel(ctx(U.gerente), H1);
    expect(lista.planos).toEqual([
      expect.objectContaining({
        id: planoId,
        nome: 'Limpeza do filtro',
        situacao: 'pausado',
        inicio: '2026-01-31',
        unidade: 'mes',
      }),
    ]);
    // A próxima data é o último dia de um mês (o início é 31/01).
    const proxima = lista.planos[0]?.proximaData ?? '';
    expect(proxima >= lista.hoje).toBe(true);
    expect((await planos.doAtivo(ctx(U.gerente), ATIVO1)).planos.map((p) => p.id)).toEqual([
      planoId,
    ]);
    const auditoria = await dono.query<{ n: string }>(
      `select count(*) as n from app.auditoria
        where tenant_id = $1 and entidade = 'plano_preventivo' and acao = 'criar' and registro_id = $2`,
      [TENANT, planoId],
    );
    expect(Number(auditoria.rows[0]?.n)).toBe(1);
    const eventos = await dono.query<{ n: string }>(
      `select count(*) as n from app.evento_dominio
        where tenant_id = $1 and tipo = 'plano_preventivo.criado' and registro_id = $2`,
      [TENANT, planoId],
    );
    expect(Number(eventos.rows[0]?.n)).toBe(1);
  });

  it('altera pela versão, ativa com o responsável, pausa e encerra', async () => {
    const { versao } = await planos.alterar(ctx(U.gerente), planoId, 1, {
      ...pedido,
      intervalo: 2,
      tecnicoId: U.tecnico,
    });
    expect(versao).toBe(2);
    await expect(planos.alterar(ctx(U.gerente), planoId, 1, pedido)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
    });
    expect(await planos.mudarSituacao(ctx(U.gerente), planoId, 2, 'ativar')).toEqual({
      versao: 3,
      situacao: 'ativo',
    });
    expect(await planos.mudarSituacao(ctx(U.gerente), planoId, 3, 'pausar')).toEqual({
      versao: 4,
      situacao: 'pausado',
    });
    expect(await planos.mudarSituacao(ctx(U.gerente), planoId, 4, 'encerrar')).toEqual({
      versao: 5,
      situacao: 'encerrado',
    });
    await expect(planos.mudarSituacao(ctx(U.gerente), planoId, 5, 'ativar')).rejects.toMatchObject({
      codigo: 'plano_encerrado',
    });
    const acoes = await dono.query<{ acao: string }>(
      `select acao from app.auditoria
        where tenant_id = $1 and entidade = 'plano_preventivo' and registro_id = $2
        order by em, id`,
      [TENANT, planoId],
    );
    expect(acoes.rows.map((r) => r.acao)).toEqual([
      'criar',
      'alterar',
      'ativar',
      'pausar',
      'encerrar',
    ]);
  });

  it('o Implantador cadastra o plano por categoria, já ativo, com a equipe', async () => {
    const { id } = await planos.criar(ctx(U.implantador), H1, {
      ...pedido,
      nome: 'PMOC',
      intervalo: 3,
      equipeId: EQUIPE,
      ativoId: null,
      categoriaId: CATEGORIA,
      ativar: true,
    });
    const doHotel = await planos.doHotel(ctx(U.implantador), H1);
    expect(doHotel.planos.find((p) => p.id === id)).toMatchObject({
      situacao: 'ativo',
      categoriaId: CATEGORIA,
      equipeId: EQUIPE,
    });
  });

  it('o Técnico não lê nem grava; o Gerente de outro hotel não vê', async () => {
    expect((await planos.doHotel(ctx(U.tecnico), H1)).planos).toEqual([]);
    const novo = { ...pedido, ativoId: ATIVO1, categoriaId: null, ativar: false };
    await expect(planos.criar(ctx(U.tecnico), H1, novo)).rejects.toMatchObject({
      codigo: 'planos_fora_do_escopo',
    });
    // Sem a regra, a RLS recusa o INSERT e não mostra o plano para alterar.
    await expect(semRegra.criar(ctx(U.tecnico), H1, novo)).rejects.toThrow();
    await expect(
      semRegra.mudarSituacao(ctx(U.tecnico), planoId, 5, 'encerrar'),
    ).rejects.toMatchObject({ codigo: 'plano_nao_encontrado' });
    expect((await planos.doAtivo(ctx(U.gerenteH2), ATIVO2)).planos).toEqual([]);
    await expect(planos.doHotel(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    // O ativo de outro hotel não serve de alvo.
    await expect(
      planos.criar(ctx(U.gerente), H1, { ...novo, ativoId: ATIVO2 }),
    ).rejects.toMatchObject({ codigo: 'plano_ativo_invalido' });
  });
});
