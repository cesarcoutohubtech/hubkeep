// GET /api/v1/chamados/{id}/avisos-sla — os avisos de SLA em aberto do
// chamado, para o selo da ficha (1c, ADR-043, M4). Quem lê o chamado e não é
// da gestão do hotel recebe a lista vazia.
import { RespostaDosAvisosDoChamado } from '@hubkeep/contratos';
import { avisoNaApi } from '../../../../../../servidor/avisos-de-sla';
import { casosDeUsoDeAvisosDeSla } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/avisos-sla\/?$/i;

export const GET = rota('avisos_sla.do_chamado', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const { avisos } = await (await casosDeUsoDeAvisosDeSla()).doChamado(ctx, id);
  return r.responder(200, RespostaDosAvisosDoChamado, { avisos: avisos.map(avisoNaApi) });
});
