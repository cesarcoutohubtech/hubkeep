// GET e POST /api/v1/hoteis/{id}/qr-reservados — os códigos de QR reservados
// do hotel e a geração de um lote (M3). A lista vem no escopo de quem pede
// (RLS: quem escreve no hotel); gerar é do Implantador e da gestão do hotel.
import {
  PedidoDeLoteDeQr,
  RespostaDeCodigosReservados,
  RespostaDeLoteDeQr,
} from '@hubkeep/contratos';
import { casosDeUsoDeQrReservados } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/qr-reservados\/?$/i;

const hotelDoCaminho = (url: string) => {
  const hotelId = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return hotelId;
};

export const GET = rota('qr_reservados.listar', async (r) => {
  const ctx = await r.contexto();
  const codigos = await (await casosDeUsoDeQrReservados()).listar(ctx, hotelDoCaminho(r.req.url));
  return r.responder(200, RespostaDeCodigosReservados, {
    codigos: codigos.map((c) => ({ ...c, criadoEm: c.criadoEm.toISOString() })),
  });
});

export const POST = rota('qr_reservados.gerar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDoCaminho(r.req.url);
  const { quantidade } = await r.corpo(PedidoDeLoteDeQr);
  const lote = await (await casosDeUsoDeQrReservados()).gerar(ctx, hotelId, quantidade);
  return r.responder(201, RespostaDeLoteDeQr, lote);
});
