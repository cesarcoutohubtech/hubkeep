// POST /api/v1/inteligencia/insights/{id}/chamado/ligacao — liga ao chamado que
// quem pede abriu as reclamações do insight ainda sem chamado, quando a
// ligação falhou depois da abertura (chamado_sem_ligacao).
import { PedidoDeLigacaoDoChamado, RespostaDoChamadoDoInsight } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/insights\/([0-9a-f-]{36})\/chamado\/ligacao\/?$/i;

export const POST = rota('inteligencia.insights.ligar_chamado', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'insight_nao_encontrado');
  const { chamadoId } = await r.corpo(PedidoDeLigacaoDoChamado);
  const ligado = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).ligarChamadoDoInsight(ctx, id, chamadoId);
  return r.responder(200, RespostaDoChamadoDoInsight, ligado);
});
