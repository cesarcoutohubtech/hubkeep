// GET /api/cron/promocao — promove as UHs do staging para app.local em cada
// tenant (F0-08), com a regra de licença da aplicação.
import { promoverUhsDoTenant, tenantsDoSistema } from '../../../../servidor/composicao';
import { rotaDeCron } from '../../../../servidor/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rotaDeCron({
  nome: 'promocao',
  tenants: tenantsDoSistema,
  porTenant: promoverUhsDoTenant,
});
