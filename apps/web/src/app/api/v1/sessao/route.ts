// GET /api/v1/sessao — quem é o usuário, pelo token verificado, e os tenants
// sugeridos para a tela de escolha (do app_metadata assinado; o banco decide).
import { usuarioDaRequisicao } from '../../../../servidor/contexto';
import { handler, json } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const u = await usuarioDaRequisicao(req);
  return json(200, { usuarioId: u.usuarioId, email: u.email, tenants: u.tenantsSugeridos });
});
