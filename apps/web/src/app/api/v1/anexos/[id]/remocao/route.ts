// POST /api/v1/anexos/{id}/remocao — remove o anexo (exclusão lógica; o arquivo
// fica no Storage). Remove quem enviou ou quem gere o hotel (B4).
import { RespostaDeAnexoRemovido } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/anexos\/([0-9a-f-]{36})\/remocao\/?$/i;

export const POST = rota('anexos.remover', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'anexo_nao_encontrado');
  await (await casosDeUsoDeAnexos()).remover(ctx, id);
  return r.responder(200, RespostaDeAnexoRemovido, { id });
});
