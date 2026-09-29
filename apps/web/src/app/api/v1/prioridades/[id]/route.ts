// PUT /api/v1/prioridades/{id} — altera nomes, ordem e peso (C1).
import { PedidoDePrioridade, RespostaDeConfiguracaoAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/prioridades\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('prioridades.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'prioridade_nao_encontrada');
  await (
    await casosDeUsoDeSituacoes()
  ).alterarPrioridade(ctx, id, await r.corpo(PedidoDePrioridade));
  return r.responder(200, RespostaDeConfiguracaoAlterada, { id });
});
