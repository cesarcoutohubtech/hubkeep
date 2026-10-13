// PUT /api/v1/politicas[?hotelId=] — grava a política no grupo, na bandeira
// (1c) ou no hotel; valor null volta a herdar (A7; ADR-026). Só o Admin do
// grupo. A resposta é a configuração vista do hotel do escopo, ou do hotel do
// hotelId (a tela que grava no grupo ou na bandeira continua no hotel escolhido).
import { PedidoDePolitica, RespostaDeConfiguracao } from '@hubkeep/contratos';
import { casosDeUsoDeConfiguracao } from '../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT = rota('politicas.gravar', async (r) => {
  const ctx = await r.contexto();
  const daUrl = new URL(r.req.url).searchParams.get('hotelId') ?? undefined;
  if (daUrl !== undefined && !UUID.test(daUrl)) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const { chave, escopo, valor } = await r.corpo(PedidoDePolitica);
  const casos = await casosDeUsoDeConfiguracao();
  await casos.gravarPolitica(ctx, chave, escopo, valor);
  const hotelId = escopo.tipo === 'hotel' ? escopo.hotelId : daUrl;
  return r.responder(200, RespostaDeConfiguracao, await casos.lerConfiguracao(ctx, hotelId));
});
