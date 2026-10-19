// GET /api/v1/inteligencia/sinais?hotelId=&situacao= — a fila de
// classificação das reclamações de hóspede do hotel (ADR-047): as sem
// classificação por padrão, só para quem decide insight no hotel.
import { ConsultaDaFilaDeSinais, RespostaDaFilaDeSinais } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';
import { filaDeSinaisNaApi } from '../serializar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inteligencia.sinais', async (r) => {
  const ctx = await r.contexto();
  const { hotelId, situacao } = r.consulta(ConsultaDaFilaDeSinais);
  const fila = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).filaDeSinais(ctx, hotelId, situacao);
  return r.responder(200, RespostaDaFilaDeSinais, filaDeSinaisNaApi(fila));
});
