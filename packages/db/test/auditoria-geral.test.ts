// Auditoria geral (fase 1c) contra Postgres real (na CI, o Supabase do runner):
//   - o Gerente do Hotel 1, que também é Técnico do Hotel 2, vê só o Hotel 1
//     (decisão 12): a RLS deixaria ler o Hotel 2, e a consulta fica com os
//     hotéis da gestão;
//   - a auditoria sem hotel segue a RLS: o Admin do grupo lê, o Gerente não;
//   - o Técnico não tem a tela (403);
//   - filtros por hotel, tipo de registro, ação e pessoa (inclusive "sistema");
//   - o cursor percorre tudo, da mais nova para a mais antiga, sem pular nem
//     repetir as linhas do mesmo milissegundo (o `em` tem microssegundos).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  type FiltroDaAuditoria,
  criarCasosDeUsoDeAuditoriaGeral,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import type { CursorDaAuditoria } from '@hubkeep/dominio';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAuditoriaGeral,
  criarPortaHistorico,
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
const U = { admin: randomUUID(), gerente: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });
const filtro: FiltroDaAuditoria = {
  de: new Date('2026-10-01T00:00:00Z'),
  ate: new Date('2026-10-31T00:00:00Z'),
  hotelId: null,
  entidade: null,
  acao: null,
  pessoa: null,
};

// As linhas: (id, hotel, entidade, ação, quem, em). M1 e M2 estão no mesmo milissegundo.
const L = {
  h1Abrir: randomUUID(),
  h2Abrir: randomUUID(),
  semHotel: randomUUID(),
  h1Sistema: randomUUID(),
  m1: '0193a000-0000-4000-8000-000000000001',
  m2: '0193a000-0000-4000-8000-000000000002',
};

describe.skipIf(!temBanco)('auditoria geral (1c)', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let casos: ReturnType<typeof criarCasosDeUsoDeAuditoriaGeral>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo da auditoria')`, [
      TENANT,
    ]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status) values
         ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
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
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, usuario, papel, escopo, hotel, U.admin],
      );
    await atribuir(U.admin, 'admin_grupo', 'grupo', null);
    await atribuir(U.gerente, 'gerente_hotel', 'hotel', H1);
    await atribuir(U.gerente, 'tecnico', 'hotel', H2);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);
    const linha = (
      id: string,
      hotel: string | null,
      entidade: string,
      acao: string,
      usuario: string | null,
      em: string,
    ) =>
      dono.query(
        `insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, antes, depois, usuario_id, em)
         values ($1, $2, $3, $4, $5, $6, null, $7, $8, $9)`,
        [id, TENANT, hotel, entidade, randomUUID(), acao, { estado: 'aberto' }, usuario, em],
      );
    await linha(L.h1Abrir, H1, 'chamado', 'abrir', U.gerente, '2026-10-05T10:00:00Z');
    await linha(L.h2Abrir, H2, 'chamado', 'abrir', U.gerente, '2026-10-06T10:00:00Z');
    await linha(L.semHotel, null, 'politica', 'gravar', U.admin, '2026-10-07T10:00:00Z');
    await linha(L.h1Sistema, H1, 'os', 'gerar', null, '2026-10-08T10:00:00Z');
    await linha(L.m1, H1, 'chamado', 'triar', U.gerente, '2026-10-09T10:00:00.000001Z');
    await linha(L.m2, H1, 'chamado', 'triar', U.gerente, '2026-10-09T10:00:00.000002Z');
    // Fora do período.
    await linha(randomUUID(), H1, 'chamado', 'abrir', U.gerente, '2026-09-30T23:59:59Z');

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 2 } });
    casos = criarCasosDeUsoDeAuditoriaGeral({
      auditoria: criarPortaAuditoriaGeral(banco),
      historico: criarPortaHistorico(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of ['app.auditoria', 'app.atribuicao_escopo', 'app.hotel', 'app.membro']) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  const ids = async (usuario: string, f: Partial<FiltroDaAuditoria> = {}) =>
    (await casos.pagina(ctx(usuario), { ...filtro, ...f })).linhas.map((l) => l.id);

  it('o Gerente vê só o hotel em que é da gestão, e não a auditoria sem hotel', async () => {
    expect(await ids(U.gerente)).toEqual([L.m2, L.m1, L.h1Sistema, L.h1Abrir]);
  });

  it('o Admin vê os dois hotéis e a auditoria sem hotel, com o nome do hotel e de quem gravou', async () => {
    const p = await casos.pagina(ctx(U.admin), filtro);
    expect(p.linhas.map((l) => l.id)).toEqual([
      L.m2,
      L.m1,
      L.h1Sistema,
      L.semHotel,
      L.h2Abrir,
      L.h1Abrir,
    ]);
    const h2 = p.linhas.find((l) => l.id === L.h2Abrir);
    expect(h2).toMatchObject({ hotelNome: 'Hotel 2', usuarioNome: 'gerente', entidade: 'chamado' });
    expect(h2?.mudancas).toEqual([{ campo: 'estado', chave: null, antes: null, depois: 'aberto' }]);
    expect(p.linhas.find((l) => l.id === L.semHotel)).toMatchObject({
      hotelId: null,
      hotelNome: null,
    });
  });

  it('o Técnico não tem a tela', async () => {
    await expect(casos.pagina(ctx(U.tecnico), filtro)).rejects.toMatchObject({
      codigo: 'auditoria_sem_permissao',
    });
  });

  it('filtros por hotel, tipo de registro, ação e pessoa', async () => {
    expect(await ids(U.admin, { hotelId: H2 })).toEqual([L.h2Abrir]);
    expect(await ids(U.admin, { entidade: 'os' })).toEqual([L.h1Sistema]);
    expect(await ids(U.admin, { acao: 'triar' })).toEqual([L.m2, L.m1]);
    expect(await ids(U.admin, { pessoa: 'sistema' })).toEqual([L.h1Sistema]);
    expect(await ids(U.admin, { pessoa: U.admin })).toEqual([L.semHotel]);
    // O Gerente que pede o Hotel 2 (onde é Técnico) não recebe nada.
    expect(await ids(U.gerente, { hotelId: H2 })).toEqual([]);
  });

  it('o cursor percorre tudo sem pular nem repetir, inclusive no mesmo milissegundo', async () => {
    const porta = criarPortaAuditoriaGeral(banco);
    const vistos: string[] = [];
    let cursor: CursorDaAuditoria | null = null;
    for (let n = 0; n < 10; n++) {
      const pagina = await porta.pagina(ctx(U.admin), filtro, cursor, 1);
      const l = pagina[0];
      if (!l) break;
      vistos.push(l.id);
      cursor = { em: l.emExato, id: l.id };
    }
    expect(vistos).toEqual([L.m2, L.m1, L.h1Sistema, L.semHotel, L.h2Abrir, L.h1Abrir]);
    const m = await porta.pagina(ctx(U.admin), { ...filtro, acao: 'triar' }, null, 2);
    expect(m.map((l) => l.emExato)).toEqual([
      '2026-10-09T10:00:00.000002Z',
      '2026-10-09T10:00:00.000001Z',
    ]);
  });
});
