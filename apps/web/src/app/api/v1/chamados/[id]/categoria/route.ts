// POST /api/v1/chamados/{id}/categoria — escolhe, troca ou tira a categoria do
// chamado até a execução, na versão vista, e refaz os prazos de SLA pela
// cópia da abertura (1c, ADR-042). Só os papéis da triagem.
import { PedidoDeAjusteDeCategoria, RespostaDeChamadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/categoria\/?$/i;

export const POST = rota('chamados.categorizar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAjusteDeCategoria);
  const gravado = await (await casosDeUsoDeTriagem()).categorizar(ctx, id, pedido);
  return r.responder(200, RespostaDeChamadoAlterado, { id, ...gravado });
});
