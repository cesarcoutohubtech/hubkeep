// GET /api/v1/inteligencia/insights — a lista de insights que quem pede lê
// (RLS da app.insight), abertos por padrão, com os filtros da tela.
import { ConsultaDeInsights, RespostaDeInsights } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';
import { insightNaApi } from '../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.insights', async (r) => {
  const ctx = await r.contexto();
  const filtro = r.consulta(ConsultaDeInsights);
  const lista = await (await casosDeUsoDoPainelDoIntelligence()).listar(ctx, filtro);
  return r.responder(200, RespostaDeInsights, {
    insights: lista.insights.map(insightNaApi),
    nomes: lista.nomes,
  });
});
