// POST /api/v1/modelos-de-checklist/{id}/reativacao — reativar o modelo (PV1).
import { RespostaDeModeloDeChecklistAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeChecklists } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-checklist\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('checklists.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'checklist_nao_encontrado');
  await (await casosDeUsoDeChecklists()).reativarModelo(ctx, id);
  return r.responder(200, RespostaDeModeloDeChecklistAlterado, { id });
});
