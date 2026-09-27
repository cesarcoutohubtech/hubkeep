// Aceite da A2 (fase 1a) contra Postgres real (na CI, o Supabase do runner):
//   - só o Admin do grupo cria, renomeia e desativa; nome repetido é 409;
//   - bandeira desativada não recebe hotel (422);
//   - trocar a bandeira do hotel muda, na transação seguinte, o que o Gestor
//     CSC da bandeira enxerga (ADR-004);
//   - com a checagem da aplicação removida, a RLS ainda barra o gerente.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeBandeiras, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaBandeiras,
  criarPortasDeAplicacao,
  listarHoteisVisiveis,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_APP/DONO.');
}

const TENANT = randomUUID();
const HOTEL = randomUUID();
const X = randomUUID();
const U = { admin: randomUUID(), gestor: randomUUID(), gerente: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('A2 — bandeiras', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeBandeiras>;
  let semChecagem: ReturnType<typeof criarCasosDeUsoDeBandeiras>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo A2')`, [TENANT]);
    await dono.query(
      `insert into app.bandeira (id, tenant_id, nome) values ($1, $2, 'Bandeira X')`,
      [X, TENANT],
    );
    await dono.query(
      `insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values ($1, $2, $3, 'Hotel A2', 'UTC', 'ativo')`,
      [HOTEL, TENANT, X],
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
    await dono.query(
      `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, concedido_por) values
         ($1, $4, $5, 'admin_grupo', 'grupo', null, null, $5),
         ($2, $4, $6, 'gestor_csc', 'bandeira', $8, null, $5),
         ($3, $4, $7, 'gerente_hotel', 'hotel', null, $9, $5)`,
      [randomUUID(), randomUUID(), randomUUID(), TENANT, U.admin, U.gestor, U.gerente, X, HOTEL],
    );
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    const deps = {
      bandeiras: criarPortaBandeiras(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    casos = criarCasosDeUsoDeBandeiras(deps);
    semChecagem = criarCasosDeUsoDeBandeiras({ ...deps, podeGerir: () => ({ permitido: true }) });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.bandeira',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('o admin cria e renomeia; nome repetido é 409; nome vazio é 422', async () => {
    const { id } = await casos.criarBandeira(ctx(U.admin), '  Bandeira   Y ');
    await expect(casos.criarBandeira(ctx(U.admin), 'Bandeira X')).rejects.toMatchObject({
      codigo: 'bandeira_nome_repetido',
    });
    await expect(casos.criarBandeira(ctx(U.admin), '   ')).rejects.toMatchObject({
      codigo: 'bandeira_nome_invalido',
    });
    await casos.renomearBandeira(ctx(U.admin), id, 'Bandeira Z');
    const nomes = (await casos.listarBandeiras(ctx(U.gestor))).map((b) => b.nome);
    expect(nomes).toEqual(['Bandeira X', 'Bandeira Z']);
  });

  it('bandeira desativada não recebe hotel; reativada, recebe', async () => {
    const z = (await casos.listarBandeiras(ctx(U.admin))).find((b) => b.nome === 'Bandeira Z');
    await casos.desativarBandeira(ctx(U.admin), z?.id ?? '');
    await expect(
      casos.definirBandeiraDoHotel(ctx(U.admin), HOTEL, z?.id ?? null),
    ).rejects.toMatchObject({
      codigo: 'bandeira_desativada',
    });
    await casos.reativarBandeira(ctx(U.admin), z?.id ?? '');
  });

  it('trocar a bandeira do hotel tira o hotel do escopo do gestor da bandeira antiga', async () => {
    expect((await banco.withContext(ctx(U.gestor), listarHoteisVisiveis)).map((h) => h.id)).toEqual(
      [HOTEL],
    );
    const z = (await casos.listarBandeiras(ctx(U.admin))).find((b) => b.nome === 'Bandeira Z');
    await casos.definirBandeiraDoHotel(ctx(U.admin), HOTEL, z?.id ?? null);
    expect(await banco.withContext(ctx(U.gestor), listarHoteisVisiveis)).toEqual([]);
    await casos.definirBandeiraDoHotel(ctx(U.admin), HOTEL, X);
    expect(
      (await banco.withContext(ctx(U.gestor), listarHoteisVisiveis)).map((h) => h.bandeiraId),
    ).toEqual([X]);
  });

  it('gestor e gerente: 403 com código; com a checagem removida, a RLS ainda barra', async () => {
    await expect(casos.criarBandeira(ctx(U.gestor), 'Nova')).rejects.toMatchObject({
      codigo: 'bandeiras_so_admin',
    });
    await expect(semChecagem.criarBandeira(ctx(U.gerente), 'Nova')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(semChecagem.desativarBandeira(ctx(U.gerente), X)).rejects.toMatchObject({
      codigo: 'bandeira_nao_encontrada',
    });
    await expect(
      semChecagem.definirBandeiraDoHotel(ctx(U.gerente), HOTEL, null),
    ).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
    const { rows } = await dono.query(`select ativa from app.bandeira where id = $1`, [X]);
    expect(rows[0]).toEqual({ ativa: true });
  });
});
