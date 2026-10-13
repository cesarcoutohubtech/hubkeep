// POST /api/v1/feriados/{id}/desativacao — desativa o feriado (1c, ADR-042).
import { RespostaDeFeriadoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeFeriados } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/feriados\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('feriados.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'feriado_nao_encontrado');
  await (await casosDeUsoDeFeriados()).desativar(ctx, id);
  return r.responder(200, RespostaDeFeriadoAlterado, { id });
});
