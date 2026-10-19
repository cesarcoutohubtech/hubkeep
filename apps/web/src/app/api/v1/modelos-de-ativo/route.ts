// GET /api/v1/modelos-de-ativo — modelos de ativo do grupo, inclusive os
// desativados (M1). Leem quem cadastra ativo, inclusive o Técnico (o PWA
// baixa os modelos para cadastrar offline).
// POST /api/v1/modelos-de-ativo — cria um modelo. Só o Admin do grupo.
import {
  PedidoDeModeloDeAtivo,
  RespostaDeModeloDeAtivoGravado,
  RespostaDeModelosDeAtivo,
} from '@hubkeep/contratos';
import { casosDeUsoDeModelosDeAtivo } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('modelos_de_ativo.listar', async (r) => {
  const ctx = await r.contexto();
  const modelos = await (await casosDeUsoDeModelosDeAtivo()).listar(ctx);
  return r.responder(200, RespostaDeModelosDeAtivo, { modelos });
});

export const POST = rota('modelos_de_ativo.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeModeloDeAtivo);
  const { id } = await (await casosDeUsoDeModelosDeAtivo()).criar(ctx, pedido);
  return r.responder(201, RespostaDeModeloDeAtivoGravado, { id, versao: 1 });
});
