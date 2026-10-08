// PUT /api/v1/fornecedores/{id} — altera o fornecedor com a versão vista; se
// ele mudou nesse meio-tempo, 409 conflito_de_versao (I3, ADR-029).
import { PedidoDeAlteracaoDeFornecedor, RespostaDeFornecedorGravado } from '@hubkeep/contratos';
import { casosDeUsoDeFornecedores } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/fornecedores\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('fornecedores.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'fornecedor_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAlteracaoDeFornecedor);
  const { versao } = await (await casosDeUsoDeFornecedores()).alterar(ctx, id, pedido);
  return r.responder(200, RespostaDeFornecedorGravado, { id, versao });
});
