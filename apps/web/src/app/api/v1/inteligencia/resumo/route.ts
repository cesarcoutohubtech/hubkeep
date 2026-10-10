// GET /api/v1/inteligencia/resumo — os quatro indicadores do Intelligence, e a
// contagem do item de menu. Sem o módulo vigente, ou sem papel que decide
// insight, 404 inteligencia_indisponivel: o menu não mostra o item.
import { RespostaDoResumoDoIntelligence } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.resumo', async (r) => {
  const ctx = await r.contexto();
  const resumo = await (await casosDeUsoDoPainelDoIntelligence()).resumo(ctx);
  return r.responder(200, RespostaDoResumoDoIntelligence, resumo);
});
