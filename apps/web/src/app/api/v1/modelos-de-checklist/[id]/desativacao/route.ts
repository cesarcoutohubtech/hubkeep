// POST /api/v1/modelos-de-checklist/{id}/desativacao — desativar o modelo
// (PV1). As OS que já o têm ficam com a cópia.
import { RespostaDeModeloDeChecklistAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeChecklists } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-checklist\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('checklists.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'checklist_nao_encontrado');
  await (await casosDeUsoDeChecklists()).desativarModelo(ctx, id);
  return r.responder(200, RespostaDeModeloDeChecklistAlterado, { id });
});
