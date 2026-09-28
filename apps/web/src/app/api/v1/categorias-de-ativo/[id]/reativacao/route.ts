// POST /api/v1/categorias-de-ativo/{id}/reativacao — reativar a categoria (B2).
import { RespostaDeCategoriaAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeCategorias } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/categorias-de-ativo\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('categorias.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'categoria_nao_encontrada');
  await (await casosDeUsoDeCategorias()).reativarCategoria(ctx, id);
  return r.responder(200, RespostaDeCategoriaAlterada, { id });
});
