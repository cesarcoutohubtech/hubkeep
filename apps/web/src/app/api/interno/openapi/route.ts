// GET /api/interno/openapi — o OpenAPI 3.1 da API /api/v1, gerado dos
// contratos (F0-07). Rota interna: exige sessão válida, não é documentação
// pública, e fica fora de /api/v1 para não entrar no próprio documento.
import { gerarOpenApi } from '@hubkeep/contratos';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('interno.openapi', async (r) => {
  await r.usuario();
  return r.json(200, gerarOpenApi());
});
