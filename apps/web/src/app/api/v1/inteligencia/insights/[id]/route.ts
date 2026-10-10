// GET /api/v1/inteligencia/insights/{id} — a página do insight: o registro, o
// detalhe e a evidência, as ações do estado, os chamados da evidência que quem
// pede vê e a série de 12 semanas.
import { RespostaDoInsight } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';
import { dataNaApi, insightNaApi } from '../../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/insights\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('inteligencia.insight', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'insight_nao_encontrado');
  const p = await (await casosDeUsoDoPainelDoIntelligence()).ver(ctx, id);
  return r.responder(200, RespostaDoInsight, {
    insight: insightNaApi(p.insight),
    chamados: p.chamados.map((c) => ({ ...c, abertoEm: dataNaApi(c.abertoEm) })),
    serie: p.serie.map((s) => ({ inicio: dataNaApi(s.inicio), quantidade: s.quantidade })),
    nomes: p.nomes,
  });
});
