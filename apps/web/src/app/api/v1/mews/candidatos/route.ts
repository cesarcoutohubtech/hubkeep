// Descoberta autenticada de hotéis de DEMONSTRAÇÃO, exclusivamente no tenant do Admin.
// GET informativo, sem vincular, persistir, acessar segredo ou chamar a API Mews.
import { RespostaDeCandidatosMews } from '@hubkeep/contratos';
import { candidatosHoteisMews } from '../../../../../servidor/composicao';
import { ErroHttp } from '../../../../../servidor/erro-http';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('mews.candidatos', async (r) => {
  const ctx = await r.contexto();
  const dados = await (await candidatosHoteisMews()).listar(ctx);
  if (dados === null) throw new ErroHttp(403, 'sem_permissao');
  return r.responder(200, RespostaDeCandidatosMews, dados);
});
