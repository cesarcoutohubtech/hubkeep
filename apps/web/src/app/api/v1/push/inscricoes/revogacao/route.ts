// POST /api/v1/push/inscricoes/revogacao — revoga a inscrição ativa do
// aparelho de quem pede, pelo endpoint (1c, ADR-046, C4).
import { PedidoDeRevogacaoPush, RespostaDaRevogacaoPush } from '@hubkeep/contratos';
import { casosDeUsoDePush } from '../../../../../../servidor/composicao';
import { rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('push.revogar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeRevogacaoPush);
  await (await casosDeUsoDePush()).revogar(ctx, pedido.endpoint);
  return r.responder(200, RespostaDaRevogacaoPush, { revogada: true });
});
