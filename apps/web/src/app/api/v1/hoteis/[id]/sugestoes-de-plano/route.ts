// GET /api/v1/hoteis/{id}/sugestoes-de-plano — os ativos com modelo e sem plano que os cubra (M1, caminho C).
import { RespostaDeSugestoesDePlano } from '@hubkeep/contratos';
import { casosDeUsoDeSugestoesDePlano } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/sugestoes-de-plano\/?$/i;

export const GET = rota('sugestoes_de_plano.listar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const lista = await (await casosDeUsoDeSugestoesDePlano()).listar(ctx, hotelId);
  return r.responder(200, RespostaDeSugestoesDePlano, lista);
});
