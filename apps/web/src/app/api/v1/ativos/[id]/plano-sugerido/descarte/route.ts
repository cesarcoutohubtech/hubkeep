// POST /api/v1/ativos/{id}/plano-sugerido/descarte — descarta a sugestão de plano do ativo, com o motivo e a versão vista (M1; ADR-029).
import { PedidoDeDescarteDaSugestao, RespostaDeDescarteDaSugestao } from '@hubkeep/contratos';
import { casosDeUsoDeSugestoesDePlano } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/plano-sugerido\/descarte\/?$/i;

export const POST = rota('sugestoes_de_plano.descartar', async (r) => {
  const ctx = await r.contexto();
  const ativoId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!ativoId) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const { versao, motivo } = await r.corpo(PedidoDeDescarteDaSugestao);
  const gravado = await (
    await casosDeUsoDeSugestoesDePlano()
  ).descartar(ctx, ativoId, versao, motivo);
  return r.responder(200, RespostaDeDescarteDaSugestao, gravado);
});
