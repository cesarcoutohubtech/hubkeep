// GET /api/v1/hoteis — hotéis visíveis ao usuário no tenant ativo. O recorte é
// da RLS: o handler não filtra nada, só entrega o contexto verificado.
import { RespostaDeHoteis } from '@hubkeep/contratos';
import { casosDeUsoDePapeis } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('hoteis.listar', async (r) => {
  const ctx = await r.contexto();
  const hoteis = await (await casosDeUsoDePapeis()).listarHoteisVisiveis(ctx);
  return r.responder(200, RespostaDeHoteis, { hoteis });
});
