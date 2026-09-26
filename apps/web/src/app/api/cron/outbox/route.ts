// GET /api/cron/outbox — a cada minuto (ADR-007). Processa os eventos pendentes
// de cada tenant com `for update skip locked`: duas execuções simultâneas não
// pegam o mesmo evento; falha adia com backoff; tenant com erro não para o laço.
import { processarOutboxDoTenant, tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'outbox',
  tenants: tenantsDoSistema,
  porTenant: processarOutboxDoTenant,
});
