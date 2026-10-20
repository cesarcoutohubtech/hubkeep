// POST /api/v1/hoteis/{id}/pacote/aplicacao — aplica o pacote da bandeira ao hotel: copia os planos pausados e sem responsável (PB1).
import { RespostaDaAplicacaoDoPacote } from '@hubkeep/contratos';
import { casosDeUsoDoPacoteDaBandeira } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/pacote\/aplicacao\/?$/i;

export const POST = rota('pacote.aplicar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const resultado = await (await casosDeUsoDoPacoteDaBandeira()).aplicar(ctx, hotelId);
  return r.responder(200, RespostaDaAplicacaoDoPacote, resultado);
});
