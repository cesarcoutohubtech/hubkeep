// POST /api/v1/ativos/{id}/decisao-do-cadastro — aprova ou recusa (com motivo) o cadastro do ativo pendente, pela versão (M4; ADR-029).
import { PedidoDeDecisaoDoCadastro, RespostaDeDecisaoDoCadastro } from '@hubkeep/contratos';
import { casosDeUsoDeCadastrosDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/decisao-do-cadastro\/?$/i;

export const POST = rota('cadastros_de_ativos.decidir', async (r) => {
  const ctx = await r.contexto();
  const ativoId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!ativoId) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const pedido = await r.corpo(PedidoDeDecisaoDoCadastro);
  const gravado = await (await casosDeUsoDeCadastrosDeAtivos()).decidir(ctx, ativoId, pedido);
  return r.responder(200, RespostaDeDecisaoDoCadastro, gravado);
});
