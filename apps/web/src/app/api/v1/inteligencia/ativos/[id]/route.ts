// GET /api/v1/inteligencia/ativos/{id} — o detalhe do ativo no Intelligence:
// a atenção dos últimos 90 dias, o último resultado gravado com o detalhe, e
// os insights do ativo e a efetividade das intervenções nele. Só para quem
// decide o insight do hotel do ativo.
import { RespostaDoAtivoNoIntelligence } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';
import { dataNaApi, efetividadesNaApi, insightNaApi } from '../../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/ativos\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('inteligencia.ativo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const casos = await casosDeUsoDoPainelDoIntelligence();
  const [p, efetividade] = await Promise.all([
    casos.ativo(ctx, id),
    casos.efetividadeDoAtivo(ctx, id),
  ]);
  return r.responder(200, RespostaDoAtivoNoIntelligence, {
    ativo: {
      ...p.ativo,
      desativadoEm: p.ativo.desativadoEm === null ? null : dataNaApi(p.ativo.desativadoEm),
    },
    serie: p.serie,
    atual: p.atual && { ...p.atual, calculadoEm: dataNaApi(p.atual.calculadoEm) },
    insights: p.insights.map(insightNaApi),
    nomes: p.nomes,
    efetividade: efetividadesNaApi(efetividade),
  });
});
