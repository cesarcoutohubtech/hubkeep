// POST /api/v1/atribuicoes/{id}/revogacao — revoga uma atribuição (A3).
import { RespostaDeRevogacaoDePapel } from '@hubkeep/contratos';
import { casosDeUsoDePapeis } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/atribuicoes\/([0-9a-f-]{36})\/revogacao\/?$/i;

export const POST = rota('atribuicoes.revogar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'atribuicao_nao_encontrada');
  await (await casosDeUsoDePapeis()).revogarPapel(ctx, id);
  return r.responder(200, RespostaDeRevogacaoDePapel, { id });
});
