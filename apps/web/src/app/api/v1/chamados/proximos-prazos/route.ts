// GET /api/v1/chamados/proximos-prazos — a contagem regressiva da tela inicial
// (1c, seção 4 da paridade): os próximos prazos de SLA a vencer, só para a
// gestão, nos hotéis do escopo dela.
import { RespostaDosProximosPrazos } from '@hubkeep/contratos';
import { casosDeUsoDeAvisosDeSla } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('avisos_sla.proximos_prazos', async (r) => {
  const ctx = await r.contexto();
  const { prazos } = await (await casosDeUsoDeAvisosDeSla()).proximosPrazos(ctx);
  return r.responder(200, RespostaDosProximosPrazos, {
    prazos: prazos.map((p) => ({ ...p, prazo: p.prazo.toISOString() })),
  });
});
