// POST /api/v1/planos-preventivos/{id}/pausa — pausar o plano, pela versão (PV2; ADR-041).
import { PedidoDeSituacaoDoPlano, RespostaDePlanoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDePlanosPreventivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/planos-preventivos\/([0-9a-f-]{36})\/pausa\/?$/i;

export const POST = rota('planos_preventivos.pausa', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'plano_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeSituacaoDoPlano);
  const feito = await (
    await casosDeUsoDePlanosPreventivos()
  ).mudarSituacao(ctx, id, versao, 'pausar');
  return r.responder(200, RespostaDePlanoAlterado, { id, ...feito });
});
