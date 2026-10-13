// POST /api/v1/planos-preventivos/{id}/ativacao — ativar o plano, pela versão (PV2; ADR-041).
import { PedidoDeSituacaoDoPlano, RespostaDePlanoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDePlanosPreventivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/planos-preventivos\/([0-9a-f-]{36})\/ativacao\/?$/i;

export const POST = rota('planos_preventivos.ativacao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'plano_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeSituacaoDoPlano);
  const feito = await (
    await casosDeUsoDePlanosPreventivos()
  ).mudarSituacao(ctx, id, versao, 'ativar');
  return r.responder(200, RespostaDePlanoAlterado, { id, ...feito });
});
