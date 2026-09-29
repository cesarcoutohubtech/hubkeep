// POST /api/v1/chamados/{id}/os — gera a OS do chamado, atribuída a um Técnico
// ou a uma equipe do hotel, na versão vista do chamado (C3; ADR-029). No
// máximo uma OS não cancelada por chamado (409 os_em_andamento).
import { PedidoDeAtribuicaoDeOs, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/os\/?$/i;

export const POST = rota('os.gerar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const pedido = await r.corpo(PedidoDeAtribuicaoDeOs);
  const gravado = await (await casosDeUsoDeTriagem()).gerarOs(ctx, id, pedido);
  return r.responder(201, RespostaDeOsGravada, gravado);
});
