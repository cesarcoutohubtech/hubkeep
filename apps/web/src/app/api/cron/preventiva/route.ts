// GET /api/cron/preventiva — geração de OS preventiva, uma vez por dia (ADR-007). A rota, o segredo e o laço
// por tenant já existem; a tarefa de cada tenant chega na fase 1b. Até lá,
// não faz nada por tenant e fica fora dos crons do vercel.json (B9 do docs/11):
// volta ao agendamento junto com a tarefa.
import { tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'preventiva',
  tenants: tenantsDoSistema,
  porTenant: async () => ({}),
});
