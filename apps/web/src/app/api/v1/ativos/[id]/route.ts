// PUT /api/v1/ativos/{id} — altera o ativo com a versão vista; se ele mudou
// nesse meio-tempo, 409 conflito_de_versao (B3, ADR-029).
import { PedidoDeAlteracaoDeAtivo, RespostaDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('ativos.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAlteracaoDeAtivo);
  const { versao } = await (await casosDeUsoDeAtivos()).alterar(ctx, id, pedido);
  return r.responder(200, RespostaDeAtivoGravado, { id, versao });
});
