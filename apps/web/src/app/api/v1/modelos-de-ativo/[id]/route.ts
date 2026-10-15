// PUT /api/v1/modelos-de-ativo/{id} — altera o modelo, com a versão vista
// (M1; ADR-029). Só o Admin do grupo.
import {
  PedidoDeAlteracaoDeModeloDeAtivo,
  RespostaDeModeloDeAtivoGravado,
} from '@hubkeep/contratos';
import { casosDeUsoDeModelosDeAtivo } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-ativo\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('modelos_de_ativo.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'modelo_ativo_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAlteracaoDeModeloDeAtivo);
  const { versao } = await (await casosDeUsoDeModelosDeAtivo()).alterar(ctx, id, pedido);
  return r.responder(200, RespostaDeModeloDeAtivoGravado, { id, versao });
});
