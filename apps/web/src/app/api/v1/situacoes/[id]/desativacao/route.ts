// POST /api/v1/situacoes/{id}/desativacao — desativar a situação (C1).
import { RespostaDeConfiguracaoAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/situacoes\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('situacoes.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'situacao_nao_encontrada');
  await (await casosDeUsoDeSituacoes()).desativarSituacao(ctx, id);
  return r.responder(200, RespostaDeConfiguracaoAlterada, { id });
});
