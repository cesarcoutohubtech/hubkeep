// GET /api/v1/sessao — quem é o usuário, pelo token verificado, e os tenants
// sugeridos para a tela de escolha (do app_metadata assinado; o banco decide).
import { RespostaDeSessao } from '@hubkeep/contratos';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('sessao.ler', async (r) => {
  const u = await r.usuario();
  return r.responder(200, RespostaDeSessao, {
    usuarioId: u.usuarioId,
    email: u.email,
    tenants: u.tenantsSugeridos,
  });
});
