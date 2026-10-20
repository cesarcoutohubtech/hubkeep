// POST /api/v1/planos-do-pacote/{id}/desativacao — desativa o plano do pacote; as cópias nos hotéis ficam (ADR-026). Com a versão vista (PB1; ADR-029).
import { PedidoDeVersaoDePlanoPadrao, RespostaDePlanoPadraoGravado } from '@hubkeep/contratos';
import { casosDeUsoDoPacoteDaBandeira } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/planos-do-pacote\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('pacote.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'plano_padrao_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeVersaoDePlanoPadrao);
  const gravado = await (await casosDeUsoDoPacoteDaBandeira()).desativar(ctx, id, versao);
  return r.responder(200, RespostaDePlanoPadraoGravado, { id, ...gravado });
});
