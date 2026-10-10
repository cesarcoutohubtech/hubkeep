// POST /api/v1/inteligencia/insights/{id}/decisao — uma pessoa decide o
// insight (ADR-033), com a versão que a tela viu. O único lugar de decisão do
// painel (proposta das telas, decisão 2).
import { PedidoDeDecisaoDoInsight, RespostaDaDecisaoDoInsight } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/insights\/([0-9a-f-]{36})\/decisao\/?$/i;

export const POST = rota('inteligencia.decidir', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'insight_nao_encontrado');
  const pedido = await r.corpo(PedidoDeDecisaoDoInsight);
  const decisao = await (await casosDeUsoDoPainelDoIntelligence()).decidir(ctx, id, pedido);
  return r.responder(200, RespostaDaDecisaoDoInsight, decisao);
});
