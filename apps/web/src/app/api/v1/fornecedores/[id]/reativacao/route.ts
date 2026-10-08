// POST /api/v1/fornecedores/{id}/reativacao — reativa o fornecedor, com a versão vista (I3).
import { PedidoDeVersaoDeFornecedor, RespostaDeFornecedorGravado } from '@hubkeep/contratos';
import { casosDeUsoDeFornecedores } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/fornecedores\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('fornecedores.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'fornecedor_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeVersaoDeFornecedor);
  const gravado = await (await casosDeUsoDeFornecedores()).reativar(ctx, id, versao);
  return r.responder(200, RespostaDeFornecedorGravado, { id, ...gravado });
});
