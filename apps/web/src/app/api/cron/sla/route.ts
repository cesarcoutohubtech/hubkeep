// GET /api/cron/sla — monitor de SLA, a cada 5 minutos (ADR-007, ADR-043):
// em cada tenant, os avisos de prazo em risco e vencido dos chamados em curso,
// gravados uma vez por prazo, com o evento chamado.sla_alerta no outbox.
import { monitorarSlaDoTenant, tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'sla',
  tenants: tenantsDoSistema,
  porTenant: monitorarSlaDoTenant,
});
