// GET /api/v1/hoteis/{id}/avisos-sla — o painel dos avisos de SLA do hotel
// (1c, ADR-043, M4): os chamados com prazo em risco ou vencido, só para a
// gestão do hotel.
import { RespostaDoPainelDeSla } from '@hubkeep/contratos';
import { avisoNaApi } from '../../../../../../servidor/avisos-de-sla';
import { casosDeUsoDeAvisosDeSla } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/avisos-sla\/?$/i;

export const GET = rota('avisos_sla.do_hotel', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const { chamados } = await (await casosDeUsoDeAvisosDeSla()).doHotel(ctx, id);
  return r.responder(200, RespostaDoPainelDeSla, {
    chamados: chamados.map((c) => ({ ...c, avisos: c.avisos.map(avisoNaApi) })),
  });
});
