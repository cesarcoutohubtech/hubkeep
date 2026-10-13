// PUT /api/v1/feriados/{id} — altera o nome e a marca "repete todo ano" (1c, ADR-042).
import { PedidoDeAlteracaoDeFeriado, RespostaDeFeriadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeFeriados } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/feriados\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('feriados.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'feriado_nao_encontrado');
  const mudanca = await r.corpo(PedidoDeAlteracaoDeFeriado);
  await (await casosDeUsoDeFeriados()).alterar(ctx, id, mudanca);
  return r.responder(200, RespostaDeFeriadoAlterado, { id });
});
