// POST /api/v1/feriados/{id}/reativacao — reativa o feriado (1c, ADR-042).
import { RespostaDeFeriadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeFeriados } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/feriados\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('feriados.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'feriado_nao_encontrado');
  await (await casosDeUsoDeFeriados()).reativar(ctx, id);
  return r.responder(200, RespostaDeFeriadoAlterado, { id });
});
