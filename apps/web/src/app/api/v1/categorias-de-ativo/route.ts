// GET /api/v1/categorias-de-ativo — categorias do tenant com os campos (B2).
// POST /api/v1/categorias-de-ativo — cria uma categoria. Só o Admin do grupo.
import {
  PedidoDeCategoria,
  RespostaDeCategoriaAlterada,
  RespostaDeCategorias,
} from '@hubkeep/contratos';
import { casosDeUsoDeCategorias } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('categorias.listar', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeCategorias,
    await (await casosDeUsoDeCategorias()).listarCategorias(ctx),
  );
});

export const POST = rota('categorias.criar', async (r) => {
  const ctx = await r.contexto();
  const { nomes, campos } = await r.corpo(PedidoDeCategoria);
  const { id } = await (await casosDeUsoDeCategorias()).criarCategoria(ctx, nomes, campos);
  return r.responder(201, RespostaDeCategoriaAlterada, { id });
});
