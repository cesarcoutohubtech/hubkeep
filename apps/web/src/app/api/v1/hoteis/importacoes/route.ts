// POST /api/v1/hoteis/importacoes — traz um hotel do staging para implantação,
// sem consumir licença (A1). O Implantador só trabalha em hotel importado.
import { PedidoDeImportacaoDeHotel, RespostaDeImportacaoDeHotel } from '@hubkeep/contratos';
import { casosDeUsoDeHoteis } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('hoteis.importar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeImportacaoDeHotel);
  const r1 = await (await casosDeUsoDeHoteis()).importarHotel(ctx, pedido);
  return r.responder(201, RespostaDeImportacaoDeHotel, r1);
});
