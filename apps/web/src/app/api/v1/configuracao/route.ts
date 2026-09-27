// GET /api/v1/configuracao[?hotelId=] — configuração do tenant (e do hotel) e
// políticas com o valor de cada nível e o efetivo (A7; ADR-026).
// PUT /api/v1/configuracao — país, subdivisão, moeda e idioma padrão do tenant.
import { PedidoDeConfiguracaoDoTenant, RespostaDeConfiguracao } from '@hubkeep/contratos';
import { casosDeUsoDeConfiguracao } from '../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = rota('configuracao.ler', async (r) => {
  const ctx = await r.contexto();
  const hotelId = new URL(r.req.url).searchParams.get('hotelId') ?? undefined;
  if (hotelId !== undefined && !UUID.test(hotelId)) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const dados = await (await casosDeUsoDeConfiguracao()).lerConfiguracao(ctx, hotelId);
  return r.responder(200, RespostaDeConfiguracao, dados);
});

export const PUT = rota('configuracao.tenant', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeConfiguracaoDoTenant);
  const casos = await casosDeUsoDeConfiguracao();
  await casos.configurarTenant(ctx, pedido);
  return r.responder(200, RespostaDeConfiguracao, await casos.lerConfiguracao(ctx));
});
