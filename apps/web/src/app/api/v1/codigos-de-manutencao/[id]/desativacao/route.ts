// POST /api/v1/codigos-de-manutencao/{id}/desativacao — desativar o código (I6).
import { RespostaDeCodigoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeCodigos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/codigos-de-manutencao\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('codigos.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'codigo_nao_encontrado');
  await (await casosDeUsoDeCodigos()).desativarCodigo(ctx, id);
  return r.responder(200, RespostaDeCodigoAlterado, { id });
});
