// Status Mews V1: leitura autenticada e restrita ao Admin do grupo.
// Sem credentials, payload do PMS, chamadas externas ou operacoes de escrita.
import { RespostaDoStatusMews } from '@hubkeep/contratos';
import { statusAdministrativoMews } from '../../../../../servidor/composicao';
import { ErroHttp } from '../../../../../servidor/erro-http';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('mews.status', async (r) => {
  const ctx = await r.contexto();
  const dados = await (await statusAdministrativoMews()).listar(ctx);
  if (dados === null) throw new ErroHttp(403, 'sem_permissao');
  return r.responder(200, RespostaDoStatusMews, dados);
});
