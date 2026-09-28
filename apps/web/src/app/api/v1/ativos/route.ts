// POST /api/v1/ativos — cadastra um ativo num local (B3). Pelo celular, o
// mesmo cadastro chega como operação offline ativo.cadastrar (ADR-025).
import { PedidoDeCadastroDeAtivo, RespostaDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('ativos.cadastrar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeCadastroDeAtivo);
  const gravado = await (await casosDeUsoDeAtivos()).cadastrar(ctx, pedido);
  return r.responder(201, RespostaDeAtivoGravado, gravado);
});
