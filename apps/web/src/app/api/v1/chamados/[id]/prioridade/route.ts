// POST /api/v1/chamados/{id}/prioridade — ajusta a prioridade até a execução,
// na versão vista (C3; ADR-029). Só os papéis da triagem.
import { PedidoDeAjusteDePrioridade, RespostaDeChamadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/prioridade\/?$/i;

export const POST = rota('chamados.priorizar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAjusteDePrioridade);
  const gravado = await (await casosDeUsoDeTriagem()).priorizar(ctx, id, pedido);
  return r.responder(200, RespostaDeChamadoAlterado, { id, ...gravado });
});
