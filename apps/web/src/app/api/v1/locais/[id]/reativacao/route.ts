// POST /api/v1/locais/{id}/reativacao — reativar a área comum (B1).
import { RespostaDeLocalAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeLocais } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/locais\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('locais.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'local_nao_encontrado');
  await (await casosDeUsoDeLocais()).reativarAreaComum(ctx, id);
  return r.responder(200, RespostaDeLocalAlterado, { id });
});
