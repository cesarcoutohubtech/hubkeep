// POST /api/v1/os/{id}/reatribuicao — passa a OS para outro Técnico ou outra
// equipe do hotel, na versão vista da OS (C3; ADR-029).
import { PedidoDeAtribuicaoDeOs, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/reatribuicao\/?$/i;

export const POST = rota('os.reatribuir', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeAtribuicaoDeOs);
  const gravado = await (await casosDeUsoDeTriagem()).reatribuirOs(ctx, id, pedido);
  return r.responder(200, RespostaDeOsGravada, { id, ...gravado });
});
