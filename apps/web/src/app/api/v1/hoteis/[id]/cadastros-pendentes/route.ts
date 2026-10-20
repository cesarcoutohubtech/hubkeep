// GET /api/v1/hoteis/{id}/cadastros-pendentes — a fila de aprovação do cadastro dos ativos do hotel (M4).
import { RespostaDeCadastrosPendentes } from '@hubkeep/contratos';
import { casosDeUsoDeCadastrosDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/cadastros-pendentes\/?$/i;

export const GET = rota('cadastros_de_ativos.pendentes', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const cadastros = await (await casosDeUsoDeCadastrosDeAtivos()).pendentes(ctx, hotelId);
  return r.responder(200, RespostaDeCadastrosPendentes, {
    cadastros: cadastros.map((c) => ({ ...c, criadoEm: c.criadoEm.toISOString() })),
  });
});
