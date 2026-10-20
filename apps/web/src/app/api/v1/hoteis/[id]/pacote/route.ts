// GET /api/v1/hoteis/{id}/pacote — o que aplicar o pacote da bandeira copiaria para o hotel (PB1).
import { RespostaDaPreviaDoPacote } from '@hubkeep/contratos';
import { casosDeUsoDoPacoteDaBandeira } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/pacote\/?$/i;

export const GET = rota('pacote.previa', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const copias = await (await casosDeUsoDoPacoteDaBandeira()).previa(ctx, hotelId);
  return r.responder(200, RespostaDaPreviaDoPacote, { copias });
});
