// Integração real SOMENTE no Postgres descartável da CI.
// Sem acesso a Supabase-dev/prod ou Mews, sem fixtures de hóspedes.
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAcessoBanco, type AcessoBanco } from '../src/index';
import {
  criarPersistenciaMews, type LoteMews, type EspacoMews, type BloqueioMews,
} from '../src/repositorios/mews-persistencia';

const URL_WORKER = process.env.HK_TESTE_URL_WORKER;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_WORKER && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1, mas faltam HK_TESTE_URL_WORKER/DONO.');
}

const T = randomUUID(), TB = randomUUID();
const H = randomUUID(), HB = randomUUID();
const U = randomUUID(), UB = randomUUID(), V = randomUUID();
const E = 'mews-demo-empresa', EB = 'mews-demo-outra-empresa';
const c0 = '2026-10-16T09:00:00.000Z';
const c1 = '2026-10-16T10:00:00.000Z';
const c2 = '2026-10-16T11:00:00.000Z';
const c3 = '2026-10-16T12:00:00.000Z';
const c4 = '2026-10-16T13:00:00.000Z';
const c5 = '2026-10-16T14:00:00.000Z';

const escopo = { tenantId: T, hotelId: H, enterpriseId: E };
function espaco(resourceId: string, ativoNoPms = true, atualizadoEm = c0): EspacoMews {
  return { ...escopo, resourceId, codigoExterno: E + '|' + resourceId,
    ativoNoPms, atualizadoEm };
}
function bloqueio(blockId: string, atualizadoEm: string, ativoNoPms: boolean): BloqueioMews {
  return { ...escopo, codigoExterno: E + '|' + blockId,
    codigoRecurso: E + '|space-1', tipoBloqueio: 'OutOfOrder',
    inicio: '2026-10-18T09:00:00.000Z', fim: '2026-10-18T11:00:00.000Z',
    ativoNoPms, atualizadoEm };
}
function plano(
  versaoEsperada: number, checkpointEsperado: string | null, novoCheckpoint: string,
  espacos: readonly EspacoMews[], bloqueios: readonly BloqueioMews[] = [],
  modo: LoteMews['modo'] = 'incremental',
): LoteMews {
  const key = JSON.stringify([T, H, E]);
  const sr = [...espacos].sort((a, b) => a.codigoExterno.localeCompare(b.codigoExterno))
    .map((r) => ({
      resourceId: r.resourceId, codigoExterno: r.codigoExterno,
      ativoNoPms: r.ativoNoPms, atualizadoEm: r.atualizadoEm,
    }));
  const sb = [...bloqueios].sort((a, b) => a.codigoExterno.localeCompare(b.codigoExterno))
    .map((b) => ({
      codigoExterno: b.codigoExterno, codigoRecurso: b.codigoRecurso,
      tipoBloqueio: b.tipoBloqueio, inicio: b.inicio, fim: b.fim,
      ativoNoPms: b.ativoNoPms, atualizadoEm: b.atualizadoEm,
    }));
  const digest = createHash('sha256').update(JSON.stringify([
    key, modo, checkpointEsperado, novoCheckpoint, sr, sb,
  ])).digest('hex');
  return { ...escopo, key, modo, versaoEsperada, checkpointEsperado,
    novoCheckpoint, espacos, bloqueios, digest };
}

describe.skipIf(!temBanco)('persistência transacional Mews V1', { timeout: 70_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [tenant, hotel, usuario] of [[T, H, U], [TB, HB, UB]] as const) {
      await dono.query('insert into app.tenant (id, nome) values ($1, $2)', [
        tenant, 'Grupo Mews de teste',
      ]);
      await dono.query(
        `insert into app.hotel (id, tenant_id, nome, fuso, status)
         values ($1, $2, 'Hotel de teste', 'Europe/Paris', 'ativo')`,
        [hotel, tenant],
      );
      await dono.query('insert into auth.users (id, email) values ($1, $2)', [
        usuario, usuario + '@hubkeep.invalid',
      ]);
      await dono.query(
        `insert into app.membro (tenant_id, usuario_id, nome, email)
         values ($1, $2, 'Admin Mews Teste', $3)`,
        [tenant, usuario, usuario + '@hubkeep.invalid'],
      );
    }
    await dono.query(
      `insert into app.mews_vinculo
       (id, tenant_id, hotel_id, enterprise_id, credencial_ref, validado_por, validado_em)
       values ($1, $2, $3, $4, 'vault:teste-sem-credencial', $5, $6)`,
      [V, T, H, E, U, c0],
    );
    banco = await criarAcessoBanco({ worker: { url: URL_WORKER ?? '', max: 4 } });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const t of [T, TB]) {
      for (const tabela of [
        'app.auditoria', 'app.mews_bloqueio', 'app.mews_checkpoint',
        'app.mews_recurso', 'app.mews_vinculo', 'app.hotel', 'app.membro',
      ]) {
        await dono.query('delete from ' + tabela + ' where tenant_id = $1', [t]);
      }
      await dono.query('delete from app.tenant where id = $1', [t]);
    }
    await dono.query('delete from auth.users where id = any($1::uuid[])', [[U, UB]]);
    await dono.end();
  });

  const estado = async () => (await dono.query<{
    versao: string; ultimo_updated_utc: Date | null; ultimo_sweep_utc: Date | null;
  }>('select versao, ultimo_updated_utc, ultimo_sweep_utc from app.mews_checkpoint where tenant_id = $1',
  [T])).rows[0];

  it('bootstrap, replay idempotente e auditoria única', async () => {
    const p = plano(0, null, c1, [espaco('space-1')]);
    const repo = criarPersistenciaMews(banco);
    expect(await repo.aplicar(p)).toMatchObject({ resultado: 'aplicado', versao: '1' });
    expect(await repo.aplicar(p)).toMatchObject({
      resultado: 'replay_idempotente', versao: '1',
    });
    expect(await estado()).toMatchObject({
      versao: '1', ultimo_sweep_utc: null,
    });
    const r = await dono.query(
      "select count(*)::integer as n from app.auditoria where tenant_id = $1 and entidade = 'mews_checkpoint'",
      [T],
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('watermarks independentes, bloqueio técnico e empate com tombstone', async () => {
    const repo = criarPersistenciaMews(banco);
    await repo.aplicar(plano(1, null, c2, [espaco('space-1')],
      [bloqueio('block-1', c2, false)], 'reconciliacao'));
    expect((await estado()).ultimo_updated_utc?.toISOString()).toBe(c1);
    expect((await estado()).ultimo_sweep_utc?.toISOString()).toBe(c2);
    // O evento ativo tem o mesmo timestamp do tombstone, logo não ressuscita.
    await repo.aplicar(plano(2, c1, c3, [espaco('space-1')],
      [bloqueio('block-1', c2, true)]));
    const bloqueios = await dono.query<{ ativo: boolean }>(
      'select ativo from app.mews_bloqueio where tenant_id = $1 and block_id = $2',
      [T, 'block-1'],
    );
    expect(bloqueios.rows[0].ativo).toBe(false);
    expect((await estado()).ultimo_sweep_utc?.toISOString()).toBe(c2);
    expect((await estado()).versao).toBe('3');
  });

  it('rollback de itens, checkpoint e auditoria se falhar antes do commit', async () => {
    const p = plano(3, c3, c4, [espaco('space-1'), espaco('space-rollback')]);
    const injetarFalha: Pick<AcessoBanco, 'executarComoSistema'> = {
      executarComoSistema: (ctx, fn) => banco.executarComoSistema(ctx, async (uow) => {
        await fn(uow);
        throw new Error('falha_simulada_antes_commit');
      }),
    };
    await expect(criarPersistenciaMews(injetarFalha).aplicar(p))
      .rejects.toThrow('falha_simulada_antes_commit');
    expect((await estado()).versao).toBe('3');
    const gravados = await dono.query(
      'select count(*)::integer as n from app.mews_recurso where resource_id = $1',
      ['space-rollback'],
    );
    expect(gravados.rows[0].n).toBe(0);
    const auditorias = await dono.query(
      "select count(*)::integer as n from app.auditoria where tenant_id = $1 and entidade = 'mews_checkpoint'",
      [T],
    );
    expect(auditorias.rows[0].n).toBe(3);
  });

  it('dois workers concorrentes: CAS permite somente um commit', async () => {
    const repo = criarPersistenciaMews(banco);
    const a = plano(3, c3, c4, [espaco('space-1'), espaco('space-A')]);
    const b = plano(3, c3, c5, [espaco('space-1'), espaco('space-B')]);
    const resultados = await Promise.allSettled([repo.aplicar(a), repo.aplicar(b)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await estado()).versao).toBe('4');
  });

  it('nega vínculo não autorizado, tenant cruzado, revogação e digest adulterado', async () => {
    const repo = criarPersistenciaMews(banco);
    const p = plano(4, c4, c5, [espaco('space-1')]);
    await expect(repo.aplicar({ ...p, digest: 'a'.repeat(64) }))
      .rejects.toThrow('mews_digest_invalido');
    const outro = { ...p, tenantId: TB, hotelId: HB, enterpriseId: EB };
    await expect(repo.aplicar(outro)).rejects.toThrow();
    const outroComDigest: LoteMews = { ...p, tenantId: TB, hotelId: HB };
    await expect(repo.aplicar(outroComDigest)).rejects.toThrow();
    await dono.query('update app.mews_vinculo set revogado_em = $2 where id = $1',
      [V, c5]);
    await expect(repo.aplicar(p)).rejects.toThrow('mews_vinculo_invalido');
  });
});
