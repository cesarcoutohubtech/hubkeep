// PUT /api/v1/categorias-de-ativo/{id} — altera nomes e campos (B2).
import { PedidoDeCategoria, RespostaDeCategoriaAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeCategorias } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/categorias-de-ativo\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('categorias.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'categoria_nao_encontrada');
  const { nomes, campos } = await r.corpo(PedidoDeCategoria);
  await (await casosDeUsoDeCategorias()).alterarCategoria(ctx, id, nomes, campos);
  return r.responder(200, RespostaDeCategoriaAlterada, { id });
});
