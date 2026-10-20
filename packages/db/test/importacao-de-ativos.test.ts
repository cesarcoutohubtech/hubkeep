// Importação de ativos por planilha (fase 1b, M2; migração 0058) contra
// Postgres real (na CI, o Supabase do runner):
//   - o Implantador importa: as linhas novas viram ativos aprovados, com a
//     chave de importação, a auditoria 'importar' e o evento ativo.criado;
//   - reenviar a mesma planilha não duplica (já importada);
//   - a chave repetida no hotel é recusada pelo banco (corrida entre envios);
//   - local de outro hotel não é achado, e o Técnico não importa, nem pelo
//     domínio nem pela RLS de outro hotel.
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import { criarCasosDeUsoDeImportacaoDeAtivos, relogioDoSistema } from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaImportacaoDeAtivos,
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
const CASA = randomUUID();
const OUTRO = randomUUID();
const U = { admin: randomUUID(), implantador: randomUUID(), tecnico: randomUUID() };
const ctx = (usuarioId: string) => ({ usuarioId, tenantId: TENANT });

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

const CSV = [
  'local;nome;numero_serie;criticidade',
  'Casa de máquinas;Bomba 1;B1;3',
  'Casa de máquinas;Bomba 2;B2;',
  'Lavanderia;Secadora;S1;',
].join('\n');

describe.skipIf(!temBanco)('M2 — importação de ativos por planilha', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let importacao: ReturnType<typeof criarCasosDeUsoDeImportacaoDeAtivos>;
  let semRegra: ReturnType<typeof criarCasosDeUsoDeImportacaoDeAtivos>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo M2')`, [TENANT]);
    for (const h of [H1, H2]) {
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status) values ($1, $2, 'Hotel', 'UTC', 'ativo')`,
        [h, TENANT],
      );
    }
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Casa de máquinas', 'casa de maquinas', 'ativo'),
              ($4, $2, $5, 'area_comum', 'Lavanderia', 'lavanderia', 'ativo')`,
      [CASA, TENANT, H1, OUTRO, H2],
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
    await atribuir(U.implantador, 'implantador', 'hotel', H1);
    await atribuir(U.tecnico, 'tecnico', 'hotel', H1);

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const deps = {
      importacao: criarPortaImportacaoDeAtivos(banco),
      atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
      relogio: relogioDoSistema,
    };
    importacao = criarCasosDeUsoDeImportacaoDeAtivos(deps);
    semRegra = criarCasosDeUsoDeImportacaoDeAtivos({
      ...deps,
      podeImportar: () => ({ permitido: true }),
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.ativo',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1::uuid[])`, [Object.values(U)]);
  });

  it('a prévia não grava; o local de outro hotel não é achado', async () => {
    const r = await importacao.prever(ctx(U.implantador), H1, CSV);
    expect(r).toMatchObject({ novas: 2, jaImportadas: 0, invalidas: 1 });
    expect(r.linhas[2]?.erros.map((e) => e.codigo)).toEqual(['importacao_local_nao_encontrado']);
    const { rows } = await dono.query(
      `select count(*)::int as n from app.ativo where tenant_id = $1`,
      [TENANT],
    );
    expect(rows[0].n).toBe(0);
  });

  it('o Implantador importa: aprovados, com a chave, a auditoria e o evento', async () => {
    const r = await importacao.importar(ctx(U.implantador), H1, CSV);
    expect(r).toMatchObject({ criadas: 2, jaImportadas: 0, invalidas: 1 });
    const { rows } = await dono.query(
      `select nome, situacao_cadastro, chave_importacao, criticidade from app.ativo
        where tenant_id = $1 order by nome`,
      [TENANT],
    );
    expect(rows).toEqual([
      expect.objectContaining({ nome: 'Bomba 1', situacao_cadastro: 'aprovado', criticidade: 3 }),
      expect.objectContaining({
        nome: 'Bomba 2',
        situacao_cadastro: 'aprovado',
        criticidade: null,
      }),
    ]);
    expect(rows.every((a) => /^v1:[0-9a-f]{64}$/.test(a.chave_importacao))).toBe(true);
    const auditoria = await dono.query(
      `select count(*)::int as n from app.auditoria
        where tenant_id = $1 and entidade = 'ativo' and acao = 'importar'`,
      [TENANT],
    );
    expect(auditoria.rows[0].n).toBe(2);
    const eventos = await dono.query(
      `select count(*)::int as n from app.evento_dominio where tenant_id = $1 and tipo = 'ativo.criado'`,
      [TENANT],
    );
    expect(eventos.rows[0].n).toBe(2);
  });

  it('reenviar a mesma planilha não duplica', async () => {
    const r = await importacao.importar(ctx(U.implantador), H1, CSV);
    expect(r).toMatchObject({ criadas: 0, jaImportadas: 2, invalidas: 1 });
  });

  it('a chave repetida no hotel é recusada pelo banco, como já importada', async () => {
    const porta = criarPortaImportacaoDeAtivos(banco);
    const { rows } = await dono.query(
      `select chave_importacao from app.ativo where tenant_id = $1 order by nome limit 1`,
      [TENANT],
    );
    const r = await porta.criar(ctx(U.implantador), H1, {
      localId: CASA,
      chaveImportacao: rows[0].chave_importacao,
      categoriaId: null,
      modeloId: null,
      nome: 'Outra bomba',
      fabricante: null,
      modelo: null,
      numeroSerie: null,
      dataCompra: null,
      garantiaAte: null,
      criticidade: null,
      campos: {},
    });
    expect(r).toBe('ja_importada');
  });

  it('o Técnico não importa; sem a regra, a RLS barra o hotel que ele não escreve', async () => {
    expect(await codigoDe(importacao.prever(ctx(U.tecnico), H1, CSV))).toBe(
      'importacao_fora_do_escopo',
    );
    // O H2 não é visível ao Implantador do H1: nem o hotel aparece.
    expect(await codigoDe(semRegra.importar(ctx(U.implantador), H2, CSV))).toBe(
      'hotel_nao_encontrado',
    );
  });
});
