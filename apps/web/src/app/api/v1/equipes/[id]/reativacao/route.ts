// POST /api/v1/equipes/{id}/reativacao (A6).
import { RespostaDeEquipeAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeEquipes } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/equipes\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('equipes.reativacao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'equipe_nao_encontrada');
  await (await casosDeUsoDeEquipes()).reativarEquipe(ctx, id);
  return r.responder(200, RespostaDeEquipeAlterada, { id });
});
