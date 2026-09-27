// POST /api/v1/equipes/{id}/membros/{usuarioId}/remocao — tira o membro da equipe (A6).
import { RespostaDeMembroDaEquipe } from '@hubkeep/contratos';
import { casosDeUsoDeEquipes } from '../../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/equipes\/([0-9a-f-]{36})\/membros\/([0-9a-f-]{36})\/remocao\/?$/i;

export const POST = rota('equipes.tirar_membro', async (r) => {
  const ctx = await r.contexto();
  const m = CAMINHO.exec(new URL(r.req.url).pathname);
  const [equipeId, usuarioId] = [m?.[1], m?.[2]];
  if (!equipeId || !usuarioId) throw new ErroHttp(404, 'equipe_nao_encontrada');
  await (await casosDeUsoDeEquipes()).tirarMembro(ctx, equipeId, usuarioId);
  return r.responder(200, RespostaDeMembroDaEquipe, { equipeId, usuarioId, ativo: false });
});
