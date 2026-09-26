// POST /api/v1/credenciais-agente/{id}/revogacao — o Admin do grupo revoga a
// credencial do agente. A partir daí, lote com ela volta 401.
import { RespostaDeRevogacao } from '@hubkeep/contratos';
import { credenciaisDeAgente } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/credenciais-agente\/([0-9a-f-]{36})\/revogacao\/?$/i;

export const POST = rota('credenciais_agente.revogar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'credencial_nao_encontrada');
  const { revogadaEm } = await (await credenciaisDeAgente()).revogarCredencial(ctx, id);
  return r.responder(200, RespostaDeRevogacao, { id, revogadaEm: revogadaEm.toISOString() });
});
