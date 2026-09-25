// GET /api/v1/hoteis — hotéis visíveis ao usuário no tenant ativo. O recorte é
// da RLS: o handler não filtra nada, só entrega o contexto verificado.
import { resolverContexto } from '../../../../servidor/contexto';
import { hoteisVisiveis } from '../../../../servidor/hoteis';
import { handler, json } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const ctx = await resolverContexto(req);
  return json(200, { hoteis: await hoteisVisiveis(ctx) });
});
