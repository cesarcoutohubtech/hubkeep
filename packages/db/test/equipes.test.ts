// Aceite da A6 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - o gerente cria equipe no hotel dele, põe e tira membro, e um técnico pode
//     estar em mais de uma equipe;
//   - nome repetido no hotel é 409; desativação lógica;
//   - o técnico lê e não gerencia (403); o gerente de outro hotel não vê (404);
//   - com a checagem da aplicação removida, a RLS ainda barra o técnico.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeEquipes, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaEquipes,
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
  gerenteH1: randomUUID(),
  gerenteH2: randomUUID(),
  tecnico: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('A6 — equipes do hotel', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeEquipes>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeEquipes>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A6')`, [TENANT]);
    for (const [id, nome] of [
      [H1, 'Hotel 1'],
      [H2, 'Hotel 2'],
    ]) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, $3, 'UTC', 'ativo')`,
        [id, TENANT, nome],
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
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerenteH1, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      equipes: criarPortaEquipes(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeEquipes(deps);
    semChecagem = criarCasosDeUsoDeEquipes({ ...deps, podeGerir: () => ({ permitido: true }) });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.equipe_membro',
      'app.equipe',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('a lista de quem recebe a OS traz só os Técnicos do hotel', async () => {
    const doH1 = await casos.listarEquipes(ctx(U.gerenteH1), H1);
    expect(doH1.tecnicos).toEqual([{ usuarioId: U.tecnico, nome: 'tecnico' }]);
    // Os membros ativos continuam todos, para pôr numa equipe.
    expect(doH1.disponiveis.length).toBeGreaterThanOrEqual(4);
    // O Técnico do H1 não cobre o H2.
    expect((await casos.listarEquipes(ctx(U.gerenteH2), H2)).tecnicos).toEqual([]);
    expect((await casos.listarEquipes(ctx(U.admin), H2)).tecnicos).toEqual([]);
  });

  it('o gerente cria equipes, põe e tira membro; o técnico fica em duas equipes', async () => {
    const eletrica = await casos.criarEquipe(ctx(U.gerenteH1), H1, 'Elétrica');
    const noite = await casos.criarEquipe(ctx(U.gerenteH1), H1, 'Plantão noite');
    await casos.porMembro(ctx(U.gerenteH1), eletrica.id, U.tecnico);
    await casos.porMembro(ctx(U.gerenteH1), noite.id, U.tecnico);
    await casos.porMembro(ctx(U.gerenteH1), noite.id, U.gerenteH1);
    await casos.tirarMembro(ctx(U.gerenteH1), noite.id, U.gerenteH1);
    const { equipes, disponiveis } = await casos.listarEquipes(ctx(U.tecnico), H1);
    expect(
      equipes.map((e) => [e.nome, e.membros.filter((m) => m.ativo).map((m) => m.nome)]),
    ).toEqual([
      ['Elétrica', ['tecnico']],
      ['Plantão noite', ['tecnico']],
    ]);
    expect(disponiveis.length).toBeGreaterThanOrEqual(4);
    // Pôr de novo quem saiu reativa, não duplica.
    await casos.porMembro(ctx(U.gerenteH1), noite.id, U.gerenteH1);
    const { rows } = await dono.query(
      `select count(*)::int as n from app.equipe_membro where equipe_id = $1 and usuario_id = $2`,
      [noite.id, U.gerenteH1],
    );
    expect(rows[0].n).toBe(1);
  });

  it('nome repetido no hotel é 409; desativar e reativar', async () => {
    await expect(casos.criarEquipe(ctx(U.gerenteH1), H1, ' Elétrica ')).rejects.toMatchObject({
      codigo: 'equipe_nome_repetido',
    });
    const outra = await casos.criarEquipe(ctx(U.gerenteH2), H2, 'Elétrica'); // outro hotel pode
    await casos.desativarEquipe(ctx(U.gerenteH2), outra.id);
    const { equipes } = await casos.listarEquipes(ctx(U.admin), H2);
    expect(equipes).toMatchObject([{ nome: 'Elétrica', ativa: false }]);
    await casos.reativarEquipe(ctx(U.gerenteH2), outra.id);
  });

  it('técnico lê e não gerencia; gerente de outro hotel não vê', async () => {
    await expect(casos.criarEquipe(ctx(U.tecnico), H1, 'X')).rejects.toMatchObject({
      codigo: 'equipes_fora_do_escopo',
    });
    await expect(casos.listarEquipes(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });

  it('com a checagem removida, a RLS ainda barra o técnico', async () => {
    await expect(semChecagem.criarEquipe(ctx(U.tecnico), H1, 'Pirata')).rejects.toMatchObject({
      code: '42501',
    });
    const { equipes } = await casos.listarEquipes(ctx(U.admin), H1);
    const eletrica = equipes.find((e) => e.nome === 'Elétrica');
    await expect(
      semChecagem.renomearEquipe(ctx(U.tecnico), eletrica?.id ?? '', 'Pirata'),
    ).rejects.toMatchObject({
      codigo: 'equipe_nao_encontrada',
    });
    await expect(
      semChecagem.porMembro(ctx(U.tecnico), eletrica?.id ?? '', U.admin),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });
});
