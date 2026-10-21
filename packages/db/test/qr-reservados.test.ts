// Códigos de QR reservados (fase 1b, M3; migração 0061) contra Postgres real
// (na CI, o Supabase do runner):
//   - a gestão gera o lote, com auditoria e evento, sem repetir código; o
//     técnico não gera, mas consulta o código da etiqueta;
//   - o ativo nasce com o código da etiqueta, e o código fica ligado; a
//     segunda ligação é recusada (qr_ja_ligado), também na corrida, pela
//     unicidade do código do ativo;
//   - o código reservado em outro hotel é recusado (qr_nao_reservado).
//
//   HK_TESTE_URL_APP, HK_TESTE_URL_DONO
import { randomUUID } from 'node:crypto';
import {
  criarCasosDeUsoDeAtivos,
  criarCasosDeUsoDeQrReservados,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaAtivos,
  criarPortaQrReservados,
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
const L1 = randomUUID();
const ADMIN = randomUUID();
const TECNICO = randomUUID();
const ctx = { usuarioId: ADMIN, tenantId: TENANT };
const doTecnico = { usuarioId: TECNICO, tenantId: TENANT };

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e);
  }
};

describe.skipIf(!temBanco)('M3 — códigos de QR reservados', { timeout: 60_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  let qr: ReturnType<typeof criarCasosDeUsoDeQrReservados>;
  let ativos: ReturnType<typeof criarCasosDeUsoDeAtivos>;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo M3')`, [TENANT]);
    await dono.query(
      `insert into app.hotel (id, tenant_id, nome, fuso, status)
       values ($1, $3, 'Hotel 1', 'UTC', 'ativo'), ($2, $3, 'Hotel 2', 'UTC', 'ativo')`,
      [H1, H2, TENANT],
    );
    await dono.query(
      `insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status)
       values ($1, $2, $3, 'area_comum', 'Casa de máquinas', 'casa de maquinas', 'ativo')`,
      [L1, TENANT, H1],
    );
    for (const [id, papel, escopo, hotel] of [
      [ADMIN, 'admin_grupo', 'grupo', null],
      [TECNICO, 'tecnico', 'hotel', H1],
    ] as const) {
      await dono.query(`insert into auth.users (id, email) values ($1, $2)`, [
        id,
        `${id}@hubkeep.invalid`,
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email) values ($1, $2, $3, $4)`,
        [TENANT, id, papel, `${id}@hubkeep.invalid`],
      );
      await dono.query(
        `insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), TENANT, id, papel, escopo, hotel, ADMIN],
      );
    }

    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 4 } });
    const { atribuicoes } = criarPortasDeAplicacao(banco);
    qr = criarCasosDeUsoDeQrReservados({
      qr: criarPortaQrReservados(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
    ativos = criarCasosDeUsoDeAtivos({
      ativos: criarPortaAtivos(banco),
      atribuicoes,
      relogio: relogioDoSistema,
    });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [
      'app.evento_dominio',
      'app.auditoria',
      'app.ativo',
      'app.qr_reservado',
      'app.local',
      'app.atribuicao_escopo',
      'app.hotel',
      'app.membro',
    ]) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.query(`delete from auth.users where id = any($1)`, [[ADMIN, TECNICO]]);
  });

  const ATIVO = {
    localId: L1,
    categoriaId: null,
    nome: 'Bomba',
    fabricante: null,
    modelo: null,
    numeroSerie: null,
  };

  it('a gestão gera o lote, com auditoria e evento; o técnico não gera', async () => {
    const lote = await qr.gerar(ctx, H1, 5);
    expect(new Set(lote.codigos).size).toBe(5);
    for (const c of lote.codigos) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const lista = await qr.listar(ctx, H1);
    expect(lista.filter((c) => c.loteId === lote.loteId)).toHaveLength(5);
    expect(lista.every((c) => !c.ligado)).toBe(true);
    const aud = await dono.query(
      `select acao from app.auditoria where tenant_id = $1 and entidade = 'qr_reservado' and registro_id = $2`,
      [TENANT, lote.loteId],
    );
    expect(aud.rows.map((r) => r.acao)).toEqual(['criar']);
    const ev = await dono.query(
      `select count(*)::int as n from app.evento_dominio where tenant_id = $1 and tipo = 'qr.reservado'`,
      [TENANT],
    );
    expect(ev.rows[0].n).toBe(1);
    expect(await codigoDe(qr.gerar(doTecnico, H1, 1))).toBe('qr_reserva_fora_do_escopo');
    expect(await codigoDe(qr.gerar(ctx, H1, 501))).toBe('qr_lote_invalido');
  });

  it('o ativo nasce com o código da etiqueta, e a segunda ligação é recusada', async () => {
    const [codigo] = (await qr.gerar(ctx, H1, 1)).codigos;
    if (!codigo) throw new Error('sem código');
    expect(await qr.consultar(doTecnico, codigo.toLowerCase())).toEqual({
      codigo,
      hotelId: H1,
      ligado: false,
    });
    const legivel = `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
    const { id } = await ativos.cadastrar(doTecnico, { ...ATIVO, codigoQr: legivel });
    const { rows } = await dono.query(`select codigo_qr from app.ativo where id = $1`, [id]);
    expect(rows[0].codigo_qr).toBe(codigo);
    expect((await qr.consultar(doTecnico, codigo)).ligado).toBe(true);
    expect(await codigoDe(ativos.cadastrar(doTecnico, { ...ATIVO, codigoQr: codigo }))).toBe(
      'qr_ja_ligado',
    );
    // A corrida: dois cadastros conferiram antes; a unicidade do ativo barra o segundo.
    const porta = criarPortaAtivos(banco);
    const dados = {
      categoriaId: null,
      modeloId: null,
      nome: 'Outra',
      fabricante: null,
      modelo: null,
      numeroSerie: null,
      dataCompra: null,
      garantiaAte: null,
      criticidade: null,
      campos: {},
    };
    expect(await codigoDe(porta.criar(ctx, H1, L1, dados, codigo))).toBe('qr_ja_ligado');
  });

  it('o código reservado em outro hotel é recusado', async () => {
    const [deOutro] = (await qr.gerar(ctx, H2, 1)).codigos;
    expect(await codigoDe(ativos.cadastrar(ctx, { ...ATIVO, codigoQr: deOutro ?? null }))).toBe(
      'qr_nao_reservado',
    );
    expect(await codigoDe(qr.consultar(doTecnico, deOutro ?? ''))).toBe('qr_nao_reservado');
  });
});
