// PUT /api/v1/atribuicoes/{id}/validade — muda a validade de uma atribuição (A3).
import { PedidoDeValidade, RespostaDeValidade } from '@hubkeep/contratos';
import { casosDeUsoDeMembros } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/atribuicoes\/([0-9a-f-]{36})\/validade\/?$/i;

export const PUT = rota('atribuicoes.validade', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'atribuicao_nao_encontrada');
  const { validoAte } = await r.corpo(PedidoDeValidade);
  await (
    await casosDeUsoDeMembros()
  ).alterarValidade(ctx, id, validoAte ? new Date(validoAte) : null);
  return r.responder(200, RespostaDeValidade, { id, validoAte });
});
