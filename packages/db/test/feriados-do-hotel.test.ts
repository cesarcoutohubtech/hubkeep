// Feriados do hotel (fase 1c; ADR-042) contra Postgres real (na CI, o Supabase
// do runner), papel hk_app:
//   - o Gerente cadastra, altera, desativa e reativa no hotel dele, com a
//     auditoria; a data aparece como aaaa-mm-dd;
//   - um feriado ativo por data: o segundo é 409 feriado_data_repetida;
//   - o Técnico lê e não grava: o domínio recusa, e, sem a checagem, a RLS
//     também (42501 no INSERT, 404 no UPDATE que não acha linha);
//   - o Gerente de outro hotel não vê.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeFeriados, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaFeriadosDoHotel,
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
  gerente: randomUUID(),
  tecnico: randomUUID(),
  gerenteH2: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('feriados do hotel (hk_app)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let feriados: ReturnType<typeof criarCasosDeUsoDeFeriados>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeFeriados>;
  let id = '';

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo Feriados')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'America/Sao_Paulo', 'ativo'), ($2, $3, 'Hotel 2', 'America/Manaus', 'ativo')`,
      [H1, H2, TENANT],
    );
    for (const [nome, u] of Object.entries(U)) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        u,
        `${u}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, u, nome, `${u}@hubkeep.invalid`],
      );
    }
    const atribuir = (usuario: string, papel: string, escopo: string, hotel: string | null) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      feriados: criarPortaFeriadosDoHotel(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    feriados = criarCasosDeUsoDeFeriados(deps);
    semChecagem = criarCasosDeUsoDeFeriados({
      ...deps,
      podeCadastrar: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.auditoria',
      'app.feriado_hotel',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('o Gerente cadastra, altera, desativa e reativa, com a auditoria', async () => {
    ({ id } = await feriados.criar(ctx(U.gerente), H1, {
      data: '2026-09-08',
      nome: ' Aniversário  da cidade ',
      anual: true,
    }));
    await feriados.alterar(ctx(U.gerente), id, { nome: 'Aniversário do município' });
    await feriados.desativar(ctx(U.gerente), id);
    await feriados.reativar(ctx(U.gerente), id);
    const lista = await feriados.listar(ctx(U.gerente), H1);
    expect(lista).toEqual({
      podeCadastrar: true,
      feriados: [
        {
          id,
          hotelId: H1,
          data: '2026-09-08',
          nome: 'Aniversário do município',
          anual: true,
          ativo: true,
        },
      ],
    });
    const auditoria = await dono.query<{ acao: string }>(
      `select acao from app.auditoria where tenant_id = $1 and registro_id = $2 order by em`,
      [TENANT, id],
    );
    expect(auditoria.rows.map((r) => r.acao)).toEqual([
      'criar',
      'alterar',
      'desativar',
      'reativar',
    ]);
  });

  it('um feriado ativo por data no hotel', async () => {
    await expect(
      feriados.criar(ctx(U.gerente), H1, { data: '2026-09-08', nome: 'Outro' }),
    ).rejects.toMatchObject({ codigo: 'feriado_data_repetida' });
  });

  it('o Técnico lê e não grava; sem a checagem, a RLS barra', async () => {
    expect((await feriados.listar(ctx(U.tecnico), H1)).podeCadastrar).toBe(false);
    await expect(
      feriados.criar(ctx(U.tecnico), H1, { data: '2026-11-03', nome: 'Ponte' }),
    ).rejects.toMatchObject({ codigo: 'feriados_fora_do_escopo' });
    await expect(
      semChecagem.criar(ctx(U.tecnico), H1, { data: '2026-11-03', nome: 'Ponte' }),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(semChecagem.desativar(ctx(U.tecnico), id)).rejects.toMatchObject({
      codigo: 'feriado_nao_encontrado',
    });
  });

  it('o Gerente de outro hotel não vê', async () => {
    await expect(feriados.listar(ctx(U.gerenteH2), H1)).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    await expect(feriados.alterar(ctx(U.gerenteH2), id, { anual: false })).rejects.toMatchObject({
      codigo: 'feriado_nao_encontrado',
    });
  });
});
