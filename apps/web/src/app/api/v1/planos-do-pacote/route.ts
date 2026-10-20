// GET /api/v1/planos-do-pacote — os planos por categoria do pacote da bandeira, inclusive os desativados (PB1).
// POST /api/v1/planos-do-pacote — cria um plano do pacote. Só o Admin do grupo.
import {
  PedidoDePlanoPadrao,
  RespostaDePlanoPadraoGravado,
  RespostaDePlanosPadrao,
} from '@hubkeep/contratos';
import { casosDeUsoDoPacoteDaBandeira } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('pacote.listar', async (r) => {
  const ctx = await r.contexto();
  const planos = await (await casosDeUsoDoPacoteDaBandeira()).planos(ctx);
  return r.responder(200, RespostaDePlanosPadrao, { planos });
});

export const POST = rota('pacote.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDePlanoPadrao);
  const { id } = await (await casosDeUsoDoPacoteDaBandeira()).criar(ctx, pedido);
  return r.responder(201, RespostaDePlanoPadraoGravado, { id, versao: 1 });
});
