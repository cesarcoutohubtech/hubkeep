// PUT /api/v1/hoteis/{id}/bandeira — troca (ou tira) a bandeira do hotel (A2).
// O escopo do Gestor CSC da bandeira muda na transação seguinte (ADR-004).
import { PedidoDeBandeiraDoHotel, RespostaDeBandeiraDoHotel } from '@hubkeep/contratos';
import { casosDeUsoDeBandeiras } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/bandeira\/?$/i;

export const PUT = rota('hoteis.bandeira', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const { bandeiraId } = await r.corpo(PedidoDeBandeiraDoHotel);
  await (await casosDeUsoDeBandeiras()).definirBandeiraDoHotel(ctx, hotelId, bandeiraId);
  return r.responder(200, RespostaDeBandeiraDoHotel, { hotelId, bandeiraId });
});
