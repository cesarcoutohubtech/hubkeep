// POST /api/v1/equipes/{id}/membros — põe (ou reativa) um membro na equipe (A6).
import { PedidoDeMembroDaEquipe, RespostaDeMembroDaEquipe } from '@hubkeep/contratos';
import { casosDeUsoDeEquipes } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/equipes\/([0-9a-f-]{36})\/membros\/?$/i;

export const POST = rota('equipes.por_membro', async (r) => {
  const ctx = await r.contexto();
  const equipeId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!equipeId) throw new ErroHttp(404, 'equipe_nao_encontrada');
  const { usuarioId } = await r.corpo(PedidoDeMembroDaEquipe);
  await (await casosDeUsoDeEquipes()).porMembro(ctx, equipeId, usuarioId);
  return r.responder(200, RespostaDeMembroDaEquipe, { equipeId, usuarioId, ativo: true });
});
