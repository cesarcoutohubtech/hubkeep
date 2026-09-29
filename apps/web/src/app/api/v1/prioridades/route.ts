// POST /api/v1/prioridades — cria uma prioridade do tenant (C1; ADR-027). Só o Admin do grupo.
import { PedidoDePrioridade, RespostaDeConfiguracaoAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('prioridades.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDePrioridade);
  const { id } = await (await casosDeUsoDeSituacoes()).criarPrioridade(ctx, pedido);
  return r.responder(201, RespostaDeConfiguracaoAlterada, { id });
});
