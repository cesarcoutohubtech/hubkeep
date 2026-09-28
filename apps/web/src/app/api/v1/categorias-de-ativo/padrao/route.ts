// POST /api/v1/categorias-de-ativo/padrao — instala as categorias padrão do
// catálogo que o tenant ainda não tem (B2). Idempotente. Só o Admin do grupo.
import { RespostaDeCategoriasPadrao } from '@hubkeep/contratos';
import { casosDeUsoDeCategorias } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('categorias.instalar_padrao', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeCategoriasPadrao,
    await (await casosDeUsoDeCategorias()).instalarCategoriasPadrao(ctx),
  );
});
