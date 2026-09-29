// POST /api/v1/chamados — abre um chamado (C2). A prioridade e a situação
// saem do servidor; a foto vai depois, como anexo do chamado.
import { PedidoDeAberturaDeChamado, RespostaDeChamadoAberto } from '@hubkeep/contratos';
import { casosDeUsoDeChamados } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('chamados.abrir', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeAberturaDeChamado);
  const aberto = await (await casosDeUsoDeChamados()).abrir(ctx, pedido);
  return r.responder(201, RespostaDeChamadoAberto, aberto);
});
