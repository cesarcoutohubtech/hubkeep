// GET /api/v1/codigos-de-manutencao — códigos de falha, causa e solução do
// tenant, inclusive os desativados (I6). Lê quem lê algum hotel.
// POST /api/v1/codigos-de-manutencao — cria um código. Só o Admin do grupo.
import {
  PedidoDeCodigoDeManutencao,
  RespostaDeCodigoAlterado,
  RespostaDeCodigosDeManutencao,
} from '@hubkeep/contratos';
import { casosDeUsoDeCodigos } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('codigos.listar', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeCodigosDeManutencao,
    await (await casosDeUsoDeCodigos()).listarCodigos(ctx),
  );
});

export const POST = rota('codigos.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeCodigoDeManutencao);
  const { id } = await (await casosDeUsoDeCodigos()).criarCodigo(ctx, pedido);
  return r.responder(201, RespostaDeCodigoAlterado, { id });
});
