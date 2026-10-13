// GET /api/v1/ativos/{id}/planos-preventivos — os planos do ativo, na ficha dele (PV2; ADR-041).
import { RespostaDePlanosPreventivos } from '@hubkeep/contratos';
import { casosDeUsoDePlanosPreventivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/planos-preventivos\/?$/i;

export const GET = rota('planos_preventivos.do_ativo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const lista = await (await casosDeUsoDePlanosPreventivos()).doAtivo(ctx, id);
  return r.responder(200, RespostaDePlanosPreventivos, lista);
});
