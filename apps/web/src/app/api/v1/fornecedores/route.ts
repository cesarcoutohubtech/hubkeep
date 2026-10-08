// GET e POST /api/v1/fornecedores — lista e cadastro de fornecedores do grupo (I3).
import {
  PedidoDeFornecedor,
  RespostaDeFornecedorGravado,
  RespostaDeFornecedores,
} from '@hubkeep/contratos';
import { casosDeUsoDeFornecedores } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('fornecedores.listar', async (r) => {
  const ctx = await r.contexto();
  const fornecedores = await (await casosDeUsoDeFornecedores()).listar(ctx);
  return r.responder(200, RespostaDeFornecedores, { fornecedores });
});

export const POST = rota('fornecedores.cadastrar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeFornecedor);
  const gravado = await (await casosDeUsoDeFornecedores()).cadastrar(ctx, pedido);
  return r.responder(201, RespostaDeFornecedorGravado, gravado);
});
