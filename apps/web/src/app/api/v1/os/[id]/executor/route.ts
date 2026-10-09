// POST /api/v1/os/{id}/executor — corrige quem executa a OS, até a conclusão,
// na versão vista (I4; ADR-029): a equipe interna ou um fornecedor ativo do
// grupo. Só os papéis da triagem.
import { PedidoDeExecutorDaOs, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/executor\/?$/i;

export const POST = rota('os.definir_executor', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeExecutorDaOs);
  const gravado = await (await casosDeUsoDeTriagem()).definirQuemExecuta(ctx, id, pedido);
  return r.responder(200, RespostaDeOsGravada, { id, ...gravado });
});
