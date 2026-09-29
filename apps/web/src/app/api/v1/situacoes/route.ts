// POST /api/v1/situacoes — cria uma situação do tenant (C1; ADR-027). Só o Admin do grupo.
import { PedidoDeSituacaoNova, RespostaDeConfiguracaoAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('situacoes.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeSituacaoNova);
  const { id } = await (await casosDeUsoDeSituacoes()).criarSituacao(ctx, pedido);
  return r.responder(201, RespostaDeConfiguracaoAlterada, { id });
});
