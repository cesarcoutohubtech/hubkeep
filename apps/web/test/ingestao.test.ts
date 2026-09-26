// Aceite da F0-08 pela rota POST /api/v1/ingestao/lotes, contra o Supabase do
// runner (CI): credencial por cabeçalho Agent, reenvio sem duplicar, credencial
// revogada com 401 e limite de tamanho. A credencial é semeada pelo dono com o
// mesmo hash que o caso de uso calcula (sha256 do segredo).
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as receberLote } from '../src/app/api/v1/ingestao/lotes/route';

const URL_DONO = process.env['HK_TESTE_URL_DONO'];
const temAmbiente = Boolean(URL_DONO && process.env['DATABASE_URL_INGESTAO']);
if (!temAmbiente && process.env['HK_EXIGIR_BANCO'] === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_DONO/DATABASE_URL_INGESTAO.');
}

const TENANT = randomUUID();
const CREDENCIAL_ID = randomUUID();
const SEGREDO = createHash('sha256').update(randomUUID()).digest('base64url');
const CREDENCIAL = `hk_${TENANT}_${SEGREDO}`;

const pedir = (corpo: unknown, autorizacao: string | null = `Agent ${CREDENCIAL}`) =>
  new Request('http://127.0.0.1:3000/api/v1/ingestao/lotes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(autorizacao && { authorization: autorizacao }),
    },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });

const LOTE = {
  fonte: 'planilha',
  entidade: 'uh',
  registros: [
    { chave: '101', dados: { hotel: 'H1', nome: '101' } },
    { chave: '102', dados: { hotel: 'H1', nome: '102' } },
  ],
};

describe.skipIf(!temAmbiente)('F0-08 — rota de ingestão', { timeout: 60_000 }, () => {
  let dono: pg.Client;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    await dono.query(`insert into app.tenant (id, nome) values ($1, 'Grupo ingestão')`, [TENANT]);
    await dono.query(
      `insert into staging.credencial_agente (id, tenant_id, descricao, hash_segredo) values ($1, $2, 'teste', $3)`,
      [CREDENCIAL_ID, TENANT, `sha256:${createHash('sha256').update(SEGREDO).digest('hex')}`],
    );
  });

  afterAll(async () => {
    if (!dono) return;
    for (const t of ['staging.registro_externo', 'staging.carga', 'staging.credencial_agente']) {
      await dono.query(`delete from ${t} where tenant_id = $1`, [TENANT]);
    }
    await dono.query(`delete from app.tenant where id = $1`, [TENANT]);
    await dono.end();
  });

  it('lote novo: 201; o mesmo lote de novo: 200 com novo false, sem duplicar', async () => {
    const primeiro = await receberLote(pedir(LOTE));
    expect(primeiro.status).toBe(201);
    const a = (await primeiro.json()) as { cargaId: string; novo: boolean; registros: number };
    expect(a).toMatchObject({ novo: true, registros: 2 });

    const segundo = await receberLote(pedir({ ...LOTE, registros: [...LOTE.registros].reverse() }));
    expect(segundo.status).toBe(200);
    expect(await segundo.json()).toMatchObject({ novo: false, cargaId: a.cargaId });

    const n = await dono.query(
      `select (select count(*)::int from staging.carga where tenant_id = $1) as cargas,
              (select count(*)::int from staging.registro_externo where tenant_id = $1) as registros`,
      [TENANT],
    );
    expect(n.rows[0]).toEqual({ cargas: 1, registros: 2 });
  });

  it('sem cabeçalho Agent, ou com credencial que não confere: 401 nao_autenticado', async () => {
    const sem = await receberLote(pedir(LOTE, null));
    expect(sem.status).toBe(401);
    const errada = await receberLote(pedir(LOTE, `Agent hk_${TENANT}_${'x'.repeat(43)}`));
    expect(errada.status).toBe(401);
    expect(((await errada.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'nao_autenticado',
    );
  });

  it('corpo acima do limite: 413 corpo_grande, antes de tocar o banco', async () => {
    const grande = JSON.stringify({ ...LOTE, lixo: 'x'.repeat(4 * 1024 * 1024 + 10) });
    const r = await receberLote(pedir(grande));
    expect(r.status).toBe(413);
    expect(((await r.json()) as { erro: { codigo: string } }).erro.codigo).toBe('corpo_grande');
  });

  it('credencial revogada: 401, e nada é gravado', async () => {
    await dono.query(`update staging.credencial_agente set revogado_em = now() where id = $1`, [
      CREDENCIAL_ID,
    ]);
    const r = await receberLote(
      pedir({ ...LOTE, registros: [{ chave: '999', dados: { hotel: 'H1', nome: '999' } }] }),
    );
    expect(r.status).toBe(401);
    const n = await dono.query(
      `select count(*)::int as n from staging.registro_externo where tenant_id = $1 and chave = '999'`,
      [TENANT],
    );
    expect(n.rows[0]).toEqual({ n: 0 });
  });
});
