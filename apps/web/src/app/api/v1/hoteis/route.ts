// GET /api/v1/hoteis — hotéis visíveis ao usuário no tenant ativo. O recorte é
// da RLS: o handler não filtra nada, só entrega o contexto verificado.
import { listarHoteisVisiveis } from '@hubkeep/db';
import { acessoBanco } from '../../../../servidor/composicao';
import { resolverContexto } from '../../../../servidor/contexto';
import { handler, json } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const ctx = await resolverContexto(req);
  const hoteis = await (await acessoBanco()).withContext(ctx, listarHoteisVisiveis);
  return json(200, { hoteis });
});
