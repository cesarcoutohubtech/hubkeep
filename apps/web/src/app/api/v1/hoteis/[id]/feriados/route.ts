// GET e POST /api/v1/hoteis/{id}/feriados — feriados do hotel (1c, ADR-042).
import { PedidoDeFeriado, RespostaDeFeriadoAlterado, RespostaDeFeriados } from '@hubkeep/contratos';
import { casosDeUsoDeFeriados } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/feriados\/?$/i;
const hotelDa = (url: string) => {
  const id = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return id;
};

export const GET = rota('feriados.listar', async (r) => {
  const ctx = await r.contexto();
  const lista = await (await casosDeUsoDeFeriados()).listar(ctx, hotelDa(r.req.url));
  return r.responder(200, RespostaDeFeriados, lista);
});

export const POST = rota('feriados.criar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDa(r.req.url);
  const pedido = await r.corpo(PedidoDeFeriado);
  const criado = await (await casosDeUsoDeFeriados()).criar(ctx, hotelId, pedido);
  return r.responder(201, RespostaDeFeriadoAlterado, criado);
});
