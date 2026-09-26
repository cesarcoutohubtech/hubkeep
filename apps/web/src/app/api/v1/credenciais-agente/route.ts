// POST /api/v1/credenciais-agente — o Admin do grupo cria a credencial do
// agente conector (ADR-008). A credencial sai só nesta resposta; o banco
// guarda o hash.
import { PedidoDeCredencial, RespostaDeCredencial } from '@hubkeep/contratos';
import { credenciaisDeAgente } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('credenciais_agente.criar', async (r) => {
  const ctx = await r.contexto();
  const { descricao } = await r.corpo(PedidoDeCredencial);
  const criada = await (await credenciaisDeAgente()).criarCredencial(ctx, descricao);
  return r.responder(201, RespostaDeCredencial, criada);
});
