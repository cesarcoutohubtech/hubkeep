// Mews V1: consulta administrativa no Postgres descartavel da CI, com RLS real.
// Nao usa Supabase-dev/prod, credenciais ou rede PMS.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AcessoBanco,
  criarAcessoBanco,
  criarPortaStatusAdministrativoMews,
} from '../src/index';

const URL_APP = process.env.HK_TESTE_URL_APP;
const URL_DONO = process.env.HK_TESTE_URL_DONO;
const temBanco = Boolean(URL_APP && URL_DONO);
if (!temBanco && process.env.HK_EXIGIR_BANCO === '1') {
  throw new Error('HK_EXIGIR_BANCO=1 requer HK_TESTE_URL_APP e HK_TESTE_URL_DONO.');
}

const T = randomUUID(),
  TB = randomUUID();
const H = randomUUID(),
  HR = randomUUID(),
  HB = randomUUID();
const UA = randomUUID(),
  UG = randomUUID(),
  UB = randomUUID();
const V = randomUUID(),
  VR = randomUUID(),
  VB = randomUUID();
const E = 'mews-view-a',
  ER = 'mews-view-revogado',
  EB = 'mews-view-b';
const C = '2026-10-17T14:00:00.000Z';

describe.skipIf(!temBanco)('Mews V1: status administrativo e RLS', { timeout: 70_000 }, () => {
  let dono: pg.Client;
  let banco: AcessoBanco;
  const ctx = (usuarioId: string, tenantId = T) => ({ usuarioId, tenantId });
  const status = async (usuarioId: string, tenantId = T) =>
    criarPortaStatusAdministrativoMews(banco).listar(ctx(usuarioId, tenantId));

  beforeAll(async () => {
    dono = new pg.Client({ connectionString: URL_DONO });
    await dono.connect();
    for (const [tenant, nome] of [
      [T, 'A'],
      [TB, 'B'],
    ]) {
      await dono.query('insert into app.tenant (id,nome) values ($1,$2)', [tenant, nome]);
    }
    for (const [hotel, tenant, nome] of [
      [H, T, 'Hotel A'],
      [HR, T, 'Hotel revogado'],
      [HB, TB, 'Hotel B'],
    ]) {
      await dono.query(
        "insert into app.hotel(id,tenant_id,nome,fuso,status) values ($1,$2,$3,'UTC','ativo')",
        [hotel, tenant, nome],
      );
    }
    for (const [user, tenant, papel, hotel] of [
      [UA, T, 'admin_grupo', null],
      [UG, T, 'gerente_hotel', H],
      [UB, TB, 'admin_grupo', null],
    ]) {
      await dono.query('insert into auth.users (id,email) values ($1,$2)', [
        user,
        user + '@mewsview.invalid',
      ]);
      await dono.query(
        "insert into app.membro(tenant_id,usuario_id,nome,email) values ($1,$2,'Teste Mews',$3)",
        [tenant, user, user + '@mewsview.invalid'],
      );
      await dono.query(
        'insert into app.atribuicao_escopo(id,tenant_id,usuario_id,papel,escopo_tipo,hotel_id,concedido_por) values ($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          tenant,
          user,
          papel,
          hotel ? 'hotel' : 'grupo',
          hotel,
          papel === 'admin_grupo' ? user : UA,
        ],
      );
    }
    for (const [id, tenant, hotel, enterprise, admin, revocado] of [
      [V, T, H, E, UA, false],
      [VR, T, HR, ER, UA, true],
      [VB, TB, HB, EB, UB, false],
    ] as const) {
      await dono.query(
        'insert into app.mews_vinculo(id,tenant_id,hotel_id,enterprise_id,credencial_ref,validado_por,validado_em,revogado_em) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          tenant,
          hotel,
          enterprise,
          'vault:fixture',
          admin,
          '2026-10-16T10:00:00Z',
          revocado ? '2026-10-17T10:00:00Z' : null,
        ],
      );
      await dono.query(
        'insert into app.mews_checkpoint(tenant_id,hotel_id,enterprise_id,versao,ultimo_updated_utc,concluido_em) values ($1,$2,$3,7,$4,$4)',
        [tenant, hotel, enterprise, C],
      );
      await dono.query(
        'insert into app.mews_recurso(tenant_id,hotel_id,enterprise_id,resource_id,ativo) values ($1,$2,$3,$4,true)',
        [tenant, hotel, enterprise, 'space-1'],
      );
      await dono.query(
        "insert into app.mews_bloqueio(tenant_id,hotel_id,enterprise_id,block_id,resource_id,tipo,inicio_utc,fim_utc,ativo,updated_utc) values ($1,$2,$3,'block-1','space-1','OutOfOrder',now(),now()+interval '1 day',true,now())",
        [tenant, hotel, enterprise],
      );
    }
    banco = await criarAcessoBanco({ app: { url: URL_APP ?? '', max: 3 } });
  });

  afterAll(async () => {
    await banco?.encerrar();
    if (!dono) return;
    for (const tenant of [T, TB]) {
      for (const table of [
        'app.mews_bloqueio',
        'app.mews_recurso',
        'app.mews_checkpoint',
        'app.mews_vinculo',
        'app.atribuicao_escopo',
        'app.hotel',
        'app.membro',
      ]) {
        await dono.query('delete from ' + table + ' where tenant_id=$1', [tenant]);
      }
      await dono.query('delete from app.tenant where id=$1', [tenant]);
    }
    await dono.query('delete from auth.users where id=any($1::uuid[])', [[UA, UG, UB]]);
    await dono.end();
  });

  it('consulta pg_policies reconhece as tres policies hk_app sem parser name[]', async () => {
    const resultado = await dono.query<{
      tablename: string;
      permite_hk_app: boolean;
      somente_leitura: boolean;
      tem_filtro: boolean;
    }>(
      `select tablename,
              ('hk_app'::name = any(roles)) as permite_hk_app,
              (cmd = 'SELECT') as somente_leitura,
              (qual is not null) as tem_filtro
         from pg_policies
        where schemaname = 'app' and policyname = 'app_admin_select'
          and tablename = any($1::text[])`,
      [['mews_checkpoint', 'mews_recurso', 'mews_bloqueio']],
    );
    expect(resultado.rows.map((r) => r.tablename).sort()).toEqual([
      'mews_bloqueio',
      'mews_checkpoint',
      'mews_recurso',
    ]);
    for (const policy of resultado.rows) {
      expect(policy).toMatchObject({
        permite_hk_app: true,
        somente_leitura: true,
        tem_filtro: true,
      });
    }
  });

  it('Admin A ve apenas hotel ativo e contagens sanitizadas', async () => {
    const r = await status(UA);
    expect(r?.hoteis).toHaveLength(1);
    expect(r?.hoteis[0]).toMatchObject({
      hotelId: H,
      nome: 'Hotel A',
      versao: '7',
      ultimoUpdatedUtc: C,
      recursosAtivos: 1,
      bloqueiosOutOfOrder: 1,
      bloqueiosInternalUse: 0,
    });
    const chaves = Object.keys(r?.hoteis[0] ?? {});
    for (const secreta of ['enterpriseId', 'credencialRef', 'digest', 'resourceId', 'blockId']) {
      expect(chaves).not.toContain(secreta);
    }
  });

  it('Gerente nao recebe a resposta administrativa nem sem vinculos', async () => {
    expect(await status(UG)).toBeNull();
  });

  it('Admin de outro grupo nao ve dados do A; tenant forjado e negado', async () => {
    const outro = await status(UB, TB);
    expect(outro?.hoteis).toHaveLength(1);
    expect(outro?.hoteis[0]?.hotelId).toBe(HB);
    expect(await status(UA, TB)).toBeNull();
  });

  it('Vinculo revogado some da listagem, sem excluir auditoria', async () => {
    const r = await status(UA);
    expect(r?.hoteis.map((x) => x.hotelId)).not.toContain(HR);
    // Esta operação administrativa no banco descartavel simula a revogação.
    await dono.query('update app.mews_vinculo set revogado_em=now() where id=$1', [V]);
    expect(await status(UA)).toEqual({ hoteis: [] });
  });
});
