// GET /api/v1/inicio/situacao-por-hotel — o quadro "Situação por hotel" da
// tela inicial (1c, seção 4 da paridade; glossário de métricas, versão 4): só
// para a gestão, nos hotéis do escopo dela.
import { RespostaDaSituacaoPorHotel } from '@hubkeep/contratos';
import { casosDeUsoDaSituacaoPorHotel } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inicio.situacao_por_hotel', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDaSituacaoPorHotel,
    await (await casosDeUsoDaSituacaoPorHotel()).consultar(ctx),
  );
});
