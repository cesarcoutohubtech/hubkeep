// POST /api/v1/chamados/{id}/impacto-hospede — corrige se o chamado afeta
// hóspede, até o aceite, na versão vista (I4; ADR-029). Só os papéis da
// triagem; null é "não sei".
import { PedidoDeImpactoNoHospede, RespostaDeChamadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/impacto-hospede\/?$/i;

export const POST = rota('chamados.informar_impacto', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const pedido = await r.corpo(PedidoDeImpactoNoHospede);
  const gravado = await (await casosDeUsoDeTriagem()).informarImpacto(ctx, id, pedido);
  return r.responder(200, RespostaDeChamadoAlterado, { id, ...gravado });
});
