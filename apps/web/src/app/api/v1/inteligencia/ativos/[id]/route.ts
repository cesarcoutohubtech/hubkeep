// GET /api/v1/inteligencia/ativos/{id} — o detalhe do ativo no Intelligence:
// a atenção dos últimos 90 dias, o último resultado gravado com o detalhe e
// os recálculos do mesmo dia (ADR-036), os insights do ativo, a efetividade
// das intervenções nele e o sinal de substituição, calculado agora, e as
// reclamações de hóspede ligadas a ele (C2 do ADR-047). Só para quem decide o
// insight do hotel do ativo.
import { RespostaDoAtivoNoIntelligence } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';
import {
  dataNaApi,
  efetividadesNaApi,
  insightNaApi,
  recalculosNaApi,
  reclamacoesNaApi,
  substituicaoNaApi,
} from '../../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/ativos\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('inteligencia.ativo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const casos = await casosDeUsoDoPainelDoIntelligence();
  const [p, efetividade, substituicao, reclamacoes] = await Promise.all([
    casos.ativo(ctx, id),
    casos.efetividadeDoAtivo(ctx, id),
    casos.substituicaoDoAtivo(ctx, id),
    casos.reclamacoesDoAtivo(ctx, id),
  ]);
  // O fuso e as datas de compra e garantia ficam no servidor: a tela recebe o sinal pronto.
  const { id: ativoId, nome, hotelId, bandeiraId, criticidade, desativadoEm } = p.ativo;
  return r.responder(200, RespostaDoAtivoNoIntelligence, {
    ativo: {
      id: ativoId,
      nome,
      hotelId,
      bandeiraId,
      criticidade,
      desativadoEm: desativadoEm === null ? null : dataNaApi(desativadoEm),
    },
    serie: p.serie,
    atual: p.atual && { ...p.atual, calculadoEm: dataNaApi(p.atual.calculadoEm) },
    recalculos: recalculosNaApi(p.recalculos),
    insights: p.insights.map(insightNaApi),
    nomes: p.nomes,
    efetividade: efetividadesNaApi(efetividade),
    substituicao: substituicao && substituicaoNaApi(substituicao),
    reclamacoes: reclamacoesNaApi(reclamacoes),
  });
});
