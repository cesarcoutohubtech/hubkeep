// PUT /api/v1/hoteis/{id}/configuracao — fuso, país, subdivisão, moeda e idioma
// do hotel; nulo herda do tenant (A7). Só o Admin do grupo.
import { PedidoDeConfiguracaoDoHotel, RespostaDeConfiguracao } from '@hubkeep/contratos';
import { casosDeUsoDeConfiguracao } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/configuracao\/?$/i;

export const PUT = rota('configuracao.hotel', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const pedido = await r.corpo(PedidoDeConfiguracaoDoHotel);
  const casos = await casosDeUsoDeConfiguracao();
  await casos.configurarHotel(ctx, id, pedido);
  return r.responder(200, RespostaDeConfiguracao, await casos.lerConfiguracao(ctx, id));
});
