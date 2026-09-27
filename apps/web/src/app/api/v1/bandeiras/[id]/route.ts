// PUT /api/v1/bandeiras/{id} — renomeia a bandeira (A2).
import { PedidoDeBandeira, RespostaDeBandeiraAlterada } from '@hubkeep/contratos';
import { casosDeUsoDeBandeiras } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/bandeiras\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('bandeiras.renomear', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'bandeira_nao_encontrada');
  const { nome } = await r.corpo(PedidoDeBandeira);
  await (await casosDeUsoDeBandeiras()).renomearBandeira(ctx, id, nome);
  return r.responder(200, RespostaDeBandeiraAlterada, { id });
});
