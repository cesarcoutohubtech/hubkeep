// PUT /api/v1/planos-do-pacote/{id} — altera o plano do pacote, com a versão vista (PB1; ADR-029). Só o Admin do grupo.
import { PedidoDeAlteracaoDePlanoPadrao, RespostaDePlanoPadraoGravado } from '@hubkeep/contratos';
import { casosDeUsoDoPacoteDaBandeira } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/planos-do-pacote\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('pacote.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'plano_padrao_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAlteracaoDePlanoPadrao);
  const { versao } = await (await casosDeUsoDoPacoteDaBandeira()).alterar(ctx, id, pedido);
  return r.responder(200, RespostaDePlanoPadraoGravado, { id, versao });
});
