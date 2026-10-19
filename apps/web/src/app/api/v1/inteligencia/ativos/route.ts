// GET /api/v1/inteligencia/ativos?busca= — "Procurar ativo" no Intelligence
// (Cesar e Kaio, 16/10/2026): os ativos em uso do trecho, só dos hotéis em que
// quem pede decide insight, para abrir a página do ativo também sem insight.
// Sem termo, a lista vem vazia; abaixo de 3 letras, 422 busca_curta.
import { RespostaDaBuscaDeAtivosNoIntelligence } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.ativos.procurar', async (r) => {
  const ctx = await r.contexto();
  const busca = new URL(r.req.url).searchParams.get('busca');
  const encontrados = await (await casosDeUsoDoPainelDoIntelligence()).procurarAtivos(ctx, busca);
  return r.responder(200, RespostaDaBuscaDeAtivosNoIntelligence, encontrados);
});
