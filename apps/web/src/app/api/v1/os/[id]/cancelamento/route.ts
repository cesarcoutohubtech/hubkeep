// POST /api/v1/os/{id}/cancelamento — cancela a OS, com motivo; o chamado volta
// à triagem (C3; ADR-029).
import { PedidoDeCancelamento, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/cancelamento\/?$/i;

export const POST = rota('os.cancelar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeCancelamento);
  const gravado = await (await casosDeUsoDeTriagem()).cancelarOs(ctx, id, pedido);
  return r.responder(200, RespostaDeOsGravada, { id, ...gravado });
});
