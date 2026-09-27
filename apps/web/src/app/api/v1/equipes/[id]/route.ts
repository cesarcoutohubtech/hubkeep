// PUT /api/v1/equipes/{id} — renomeia a equipe (A6).
import { PedidoDeEquipe, RespostaDeEquipeAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeEquipes } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/equipes\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('equipes.renomear', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'equipe_nao_encontrada');
  const { nome } = await r.corpo(PedidoDeEquipe);
  await (await casosDeUsoDeEquipes()).renomearEquipe(ctx, id, nome);
  return r.responder(200, RespostaDeEquipeAlterada, { id });
});
