// GET e POST /api/v1/hoteis/{id}/planos-preventivos — planos do hotel (PV2; ADR-041).
import {
  PedidoDeNovoPlanoPreventivo,
  RespostaDePlanoAlterado,
  RespostaDePlanosPreventivos,
} from '@hubkeep/contratos';
import { casosDeUsoDePlanosPreventivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/planos-preventivos\/?$/i;
const hotelDa = (url: string) => {
  const id = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return id;
};

export const GET = rota('planos_preventivos.listar', async (r) => {
  const ctx = await r.contexto();
  const lista = await (await casosDeUsoDePlanosPreventivos()).doHotel(ctx, hotelDa(r.req.url));
  return r.responder(200, RespostaDePlanosPreventivos, lista);
});

export const POST = rota('planos_preventivos.criar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDa(r.req.url);
  const pedido = await r.corpo(PedidoDeNovoPlanoPreventivo);
  const criado = await (await casosDeUsoDePlanosPreventivos()).criar(ctx, hotelId, pedido);
  return r.responder(201, RespostaDePlanoAlterado, criado);
});
