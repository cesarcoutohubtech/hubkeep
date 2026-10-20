// GET /api/v1/indicadores?inicio=&fim=&hotelId=&bandeiraId= — o painel de
// indicadores (1c, item 8): o período em dias locais, contados no fuso de cada
// hotel. A gestão vê tudo no escopo dela; o proprietário, só os cartões.
import { ConsultaDosIndicadores, RespostaDosIndicadores } from '@hubkeep/contratos';
import { casosDeUsoDeIndicadores } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('indicadores.consultar', async (r) => {
  const ctx = await r.contexto();
  const { inicio, fim, hotelId, bandeiraId } = r.consulta(ConsultaDosIndicadores);
  const painel = await (
    await casosDeUsoDeIndicadores()
  ).consultar(ctx, {
    periodo: { inicio, fim },
    hotelId,
    bandeiraId,
  });
  return r.responder(200, RespostaDosIndicadores, painel);
});
