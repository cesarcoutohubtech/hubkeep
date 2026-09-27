// POST /api/v1/bandeiras/{id}/desativacao (A2). Só o Admin do grupo.
import { RespostaDeBandeiraAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeBandeiras } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/bandeiras\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('bandeiras.desativacao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'bandeira_nao_encontrada');
  await (await casosDeUsoDeBandeiras()).desativarBandeira(ctx, id);
  return r.responder(200, RespostaDeBandeiraAlterada, { id });
});
