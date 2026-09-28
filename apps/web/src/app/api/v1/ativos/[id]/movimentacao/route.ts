// POST /api/v1/ativos/{id}/movimentacao — move o ativo para outro local do
// mesmo hotel, com a versão vista (B3c, adendo ao ADR-011). Só quem gere o
// hotel; grava a movimentação e a auditoria.
import { PedidoDeMovimentacaoDeAtivo, RespostaDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/movimentacao\/?$/i;

export const POST = rota('ativos.mover', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const pedido = await r.corpo(PedidoDeMovimentacaoDeAtivo);
  const gravado = await (await casosDeUsoDeAtivos()).mover(ctx, id, pedido);
  return r.responder(200, RespostaDeAtivoGravado, { id, ...gravado });
});
