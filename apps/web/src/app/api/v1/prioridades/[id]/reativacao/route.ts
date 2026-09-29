// POST /api/v1/prioridades/{id}/reativacao — reativar a prioridade (C1).
import { RespostaDeConfiguracaoAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/prioridades\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('prioridades.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'prioridade_nao_encontrada');
  await (await casosDeUsoDeSituacoes()).reativarPrioridade(ctx, id);
  return r.responder(200, RespostaDeConfiguracaoAlterada, { id });
});
