// PUT /api/v1/planos-preventivos/{id} — altera o plano, pela versão (PV2; ADR-041).
import { PedidoDeAlteracaoDePlanoPreventivo, RespostaDePlanoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDePlanosPreventivos } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/planos-preventivos\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('planos_preventivos.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'plano_nao_encontrado');
  const { versao, ...dados } = await r.corpo(PedidoDeAlteracaoDePlanoPreventivo);
  const r2 = await (await casosDeUsoDePlanosPreventivos()).alterar(ctx, id, versao, dados);
  return r.responder(200, RespostaDePlanoAlterado, { id, versao: r2.versao });
});
