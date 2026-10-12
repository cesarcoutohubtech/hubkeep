// GET /api/cron/inteligencia — o job diário do Intelligence (ADR-036): por
// tenant, com o hk_worker e numa transação por tenant, calcula o dia, grava a
// métrica de cada ativo e abre ou atualiza os insights. O tenant sem o módulo
// vigente não lê nem grava nada. No vercel.json, uma vez por dia às 06:00 UTC,
// 03:00 de Brasília (Cesar, 12/10/2026), depois que o painel passou a ler a
// métrica (#192).
import { calcularDiaDoIntelligence, tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'inteligencia',
  tenants: tenantsDoSistema,
  porTenant: calcularDiaDoIntelligence,
});
