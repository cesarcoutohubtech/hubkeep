// POST /api/v1/inteligencia/insights/{id}/chamado — um chamado para as
// reclamações do insight sistêmico (proposta de 19/10/2026, item 1): pelo caso
// de uso do núcleo, como qualquer chamado, e depois as reclamações sem chamado
// são ligadas a ele.
import { PedidoDeChamadoDoInsight, RespostaDoChamadoDoInsight } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/insights\/([0-9a-f-]{36})\/chamado\/?$/i;

export const POST = rota('inteligencia.insights.abrir_chamado', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'insight_nao_encontrado');
  const pedido = await r.corpo(PedidoDeChamadoDoInsight);
  const aberto = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).abrirChamadoDoInsight(ctx, id, pedido);
  return r.responder(201, RespostaDoChamadoDoInsight, aberto);
});
