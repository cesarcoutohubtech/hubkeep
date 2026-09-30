// POST /api/v1/paradas/{id}/encerramento — encerra a parada aberta (C5), pela
// gestão do hotel (Admin do grupo, Gestor CSC, Gerente); sem fim, agora. O
// Técnico responsável encerra na execução, pela operação offline.
import { PedidoDeEncerramentoDeParada, RespostaDeParadaEncerrada } from '@hubkeep/contratos';
import { casosDeUsoDeParadas } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/paradas\/([0-9a-f-]{36})\/encerramento\/?$/i;

export const POST = rota('paradas.encerrar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'parada_nao_encontrada');
  const pedido = await r.corpo(PedidoDeEncerramentoDeParada);
  const { fim } = await (
    await casosDeUsoDeParadas()
  ).encerrar(ctx, id, {
    fim: pedido.fim ? new Date(pedido.fim) : null,
  });
  return r.responder(200, RespostaDeParadaEncerrada, { id, fim: fim.toISOString() });
});
