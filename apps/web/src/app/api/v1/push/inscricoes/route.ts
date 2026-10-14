// POST /api/v1/push/inscricoes — grava a inscrição de push do aparelho de quem
// pede (1c, ADR-046, C4). A RLS só deixa gravar a própria.
import { PedidoDeInscricaoPush, RespostaDaInscricaoPush } from '@hubkeep/contratos';
import { casosDeUsoDePush } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('push.inscrever', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeInscricaoPush);
  const { id } = await (
    await casosDeUsoDePush()
  ).inscrever(ctx, {
    endpoint: pedido.endpoint,
    chaves: pedido.keys,
  });
  return r.responder(201, RespostaDaInscricaoPush, { id });
});
