// POST /api/v1/atribuicoes — concede um papel num escopo (A3). As regras de
// escalada são as do domínio (F0-06), e a RLS é a garantia.
import { PedidoDeConcessaoDePapel, RespostaDeConcessaoDePapel } from '@hubkeep/contratos';
import { casosDeUsoDePapeis } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('atribuicoes.conceder', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeConcessaoDePapel);
  const { id } = await (
    await casosDeUsoDePapeis()
  ).concederPapel(ctx, {
    usuarioId: pedido.usuarioId,
    papel: pedido.papel,
    escopo: pedido.escopo,
    validoAte: pedido.validoAte ? new Date(pedido.validoAte) : null,
  });
  return r.responder(201, RespostaDeConcessaoDePapel, { id });
});
