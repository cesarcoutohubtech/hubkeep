// PUT /api/v1/politicas — grava a política no grupo ou no hotel; valor null
// volta a herdar (A7; ADR-026). Só o Admin do grupo.
import { PedidoDePolitica, RespostaDeConfiguracao } from '@hubkeep/contratos';
import { casosDeUsoDeConfiguracao } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = rota('politicas.gravar', async (r) => {
  const ctx = await r.contexto();
  const { chave, escopo, valor } = await r.corpo(PedidoDePolitica);
  const casos = await casosDeUsoDeConfiguracao();
  await casos.gravarPolitica(ctx, chave, escopo, valor);
  const hotelId = escopo.tipo === 'hotel' ? escopo.hotelId : undefined;
  return r.responder(200, RespostaDeConfiguracao, await casos.lerConfiguracao(ctx, hotelId));
});
