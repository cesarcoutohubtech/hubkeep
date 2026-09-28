// Aceite da B3c (fase 1a; adendo ao ADR-011) contra Postgres real (na CI, o Supabase do runner):
//   - quem gere o hotel move o ativo para outro local do mesmo hotel; a
//     movimentação (origem, destino, quem, quando), a auditoria e o evento
//     saem na mesma unit of work;
//   - o proprietário da UH antiga deixa de ver o ativo, e o da nova passa a
//     ver; o proprietário não lê movimentações;
//   - o técnico não move (403); mesmo local, destino inativo, destino em outro
//     hotel, ativo desativado e versão velha são recusados com código;
//   - com as checagens removidas, o banco ainda barra: a FK recusa local de
//     outro hotel, e quem não escreve no hotel não acha a linha;
//   - recusa não grava movimentação.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeAtivos, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
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
const L = { uh101: randomUUID(), uh102: randomUUID(), inativo: randomUUID(), h2: randomUUID() };
const PROPRIETARIO = randomUUID();
const U = {
  admin: randomUUID(),
  gerente: randomUUID(),
  tecnico: randomUUID(),
  gerenteH2: randomUUID(),
  dono: randomUUID(),
};
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

describe.skipIf(!temBanco)('B3c — mover ativo dentro do hotel', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeAtivos>;
  let ativo = '';

  const movimentacoesGravadas = async () =>
    (
      await dono.query(
        `select local_origem_id, local_destino_id, usuario_id from app.ativo_movimentacao
         where tenant_id = $1 and ativo_id = $2 order by movido_em, id`,
        [TENANT, ativo],
      )
    ).rows;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo B3c')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
       ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, status, cod_externo) values
       ($1, $5, $6, 'uh', 'UH 101', 'ativo', '101'),
       ($2, $5, $6, 'uh', 'UH 102', 'ativo', '102'),
       ($3, $5, $6, 'area_comum', 'Depósito antigo', 'inativo', null),
       ($4, $5, $7, 'area_comum', 'Lobby H2', 'ativo', null)`,
      [L.uh101, L.uh102, L.inativo, L.h2, TENANT, H1, H2],
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
    await dono.query(`insert into app.proprietario (id, tenant_id, nome) values ($1, $2, 'Dono')`, [
      PROPRIETARIO,
      TENANT,
    ]);
    await dono.query(
      `insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio)
       values ($1, $2, $3, $4, current_date - 1)`,
      [randomUUID(), TENANT, PROPRIETARIO, L.uh101],
    );
    const atribuir = (
      usuario: string,
      papel: string,
      escopo: string,
      hotel: string | null,
      proprietario: string | null = null,
    ) =>
      dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, proprietario, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    await atribuir(U.gerenteH2, 'gerente_hotel', 'hotel', H2);
    await atribuir(U.dono, 'proprietario', 'proprietario', null, PROPRIETARIO);
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    });
    ativo = (
      await casos.cadastrar(ctx(U.tecnico), {
        localId: L.uh101,
        categoriaId: null,
        nome: 'Frigobar',
        fabricante: null,
        modelo: null,
        numeroSerie: null,
      })
    ).id;
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.ativo_movimentacao',
      'app.ativo',
      'app.local_proprietario',
      'app.atribuicao_escopo',
      'app.proprietario',
      'app.local',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('o gerente move dentro do hotel: movimentação, auditoria e evento', async () => {
    expect((await casos.listarAtivos(ctx(U.dono), H1)).map((a) => a.id)).toEqual([ativo]);
    expect(
      await casos.mover(ctx(U.gerente), ativo, { localDestinoId: L.uh102, versao: 1 }),
    ).toEqual({ versao: 2 });
    const [movido] = await casos.listarAtivos(ctx(U.gerente), H1);
    expect(movido).toMatchObject({ localId: L.uh102, versao: 2 });
    const [m] = await casos.listarMovimentacoes(ctx(U.gerente), ativo);
    expect(m).toMatchObject({
      localOrigemId: L.uh101,
      localDestinoId: L.uh102,
      usuarioId: U.gerente,
      nomeUsuario: 'gerente',
    });
    expect(m?.movidoEm).toBeInstanceOf(Date);
    const auditoria = await dono.query(
      `select antes, depois, usuario_id from app.auditoria
       where tenant_id = $1 and entidade = 'ativo' and registro_id = $2 and acao = 'mover'`,
      [TENANT, ativo],
    );
    expect(auditoria.rows).toEqual([
      {
        antes: { localId: L.uh101, versao: 1 },
        depois: { localId: L.uh102, versao: 2 },
        usuario_id: U.gerente,
      },
    ]);
    const evento = await dono.query(
      `select payload from app.evento_dominio where tenant_id = $1 and tipo = 'ativo.movido'`,
      [TENANT],
    );
    expect(evento.rows[0]?.payload).toMatchObject({
      hotelId: H1,
      localOrigemId: L.uh101,
      localDestinoId: L.uh102,
    });
  });

  it('o dono da UH antiga deixa de ver, e volta a ver quando o ativo volta', async () => {
    expect(await casos.listarAtivos(ctx(U.dono), H1)).toEqual([]);
    await expect(casos.listarMovimentacoes(ctx(U.dono), ativo)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    expect(await casos.mover(ctx(U.admin), ativo, { localDestinoId: L.uh101, versao: 2 })).toEqual({
      versao: 3,
    });
    expect((await casos.listarAtivos(ctx(U.dono), H1)).map((a) => a.id)).toEqual([ativo]);
    // Vê o ativo, mas não lê movimentações (RLS).
    expect(await casos.listarMovimentacoes(ctx(U.dono), ativo)).toEqual([]);
  });

  it('recusas com código, sem gravar movimentação', async () => {
    const mover = (usuario: string, localDestinoId: string, versao = 3) =>
      casos.mover(ctx(usuario), ativo, { localDestinoId, versao });
    await expect(mover(U.tecnico, L.uh102)).rejects.toMatchObject({
      codigo: 'mover_ativo_fora_do_escopo',
    });
    await expect(mover(U.gerente, L.uh101)).rejects.toMatchObject({
      codigo: 'mover_ativo_mesmo_local',
    });
    await expect(mover(U.gerente, L.inativo)).rejects.toMatchObject({
      codigo: 'mover_ativo_local_inativo',
    });
    await expect(mover(U.admin, L.h2)).rejects.toMatchObject({
      codigo: 'mover_ativo_entre_hoteis',
    });
    // O gerente do Hotel 1 nem enxerga o local do Hotel 2.
    await expect(mover(U.gerente, L.h2)).rejects.toMatchObject({
      codigo: 'local_nao_encontrado',
    });
    await expect(mover(U.gerente, L.uh102, 2)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
      parametros: { versaoAtual: 3 },
    });
    await expect(mover(U.gerenteH2, L.uh102)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    expect(await casos.desativar(ctx(U.gerente), ativo, 3)).toEqual({ versao: 4 });
    await expect(mover(U.gerente, L.uh102, 4)).rejects.toMatchObject({
      codigo: 'ativo_desativado',
    });
    expect(await casos.reativar(ctx(U.gerente), ativo, 4)).toEqual({ versao: 5 });
    expect(await movimentacoesGravadas()).toHaveLength(2);
  });

  it('com as checagens removidas, o banco ainda barra', async () => {
    const semRegra = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
      podeMover: () => ({ permitido: true }),
      validarMover: () => undefined,
    });
    await expect(
      semRegra.mover(ctx(U.admin), ativo, { localDestinoId: L.h2, versao: 5 }),
    ).rejects.toMatchObject({ code: '23503' });
    const porta = criarPortaAtivos(banco);
    await expect(porta.mover(ctx(U.gerenteH2), ativo, 5, L.uh102)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    // O proprietário lê o ativo, mas sem escrita no hotel o FOR UPDATE não acha a linha.
    await expect(porta.mover(ctx(U.dono), ativo, 5, L.uh102)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    const [atual] = await casos.listarAtivos(ctx(U.admin), H1);
    expect(atual).toMatchObject({ localId: L.uh101, versao: 5 });
    expect(await movimentacoesGravadas()).toEqual([
      { local_origem_id: L.uh101, local_destino_id: L.uh102, usuario_id: U.gerente },
      { local_origem_id: L.uh102, local_destino_id: L.uh101, usuario_id: U.admin },
    ]);
  });
});
