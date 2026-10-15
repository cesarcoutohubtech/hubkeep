// GET /api/v1/inteligencia/efetividade — a seção abaixo da lista de insights:
// as intervenções concluídas nos últimos 180 dias, com o antes e depois, só
// dos hotéis em que quem pede decide insight (adendo ao ADR-033, 15/10/2026).
import { RespostaDasEfetividades } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';
import { efetividadesNaApi } from '../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.efetividade', async (r) => {
  const ctx = await r.contexto();
  const e = await (await casosDeUsoDoPainelDoIntelligence()).efetividades(ctx);
  return r.responder(200, RespostaDasEfetividades, efetividadesNaApi(e));
});
