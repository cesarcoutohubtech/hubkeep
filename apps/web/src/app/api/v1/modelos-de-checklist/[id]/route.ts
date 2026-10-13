// PUT /api/v1/modelos-de-checklist/{id} — altera nomes, categoria e itens do
// modelo (PV1). A versão sobe só quando os itens mudam.
import { PedidoDeModeloDeChecklist, RespostaDeModeloDeChecklistAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeChecklists } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-checklist\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('checklists.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'checklist_nao_encontrado');
  const pedido = await r.corpo(PedidoDeModeloDeChecklist);
  const { versao } = await (await casosDeUsoDeChecklists()).alterarModelo(ctx, id, pedido);
  return r.responder(200, RespostaDeModeloDeChecklistAlterado, { id, versao });
});
