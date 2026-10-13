// GET /api/v1/comunicacao/envios/contagem?de=&ate=&hotelId= — os envios por
// destinatário e por dia (1c, ADR-046, C8), disponível desde o primeiro dia do
// piloto. Só a gestão; a RLS de app.envio_notificacao mostra os hotéis de
// cada um.
import { ConsultaDaContagemDeEnvios, RespostaDaContagemDeEnvios } from '@hubkeep/contratos';
import { casosDeUsoDeComunicacao } from '../../../../../../servidor/composicao';
import { rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('comunicacao.contagem_de_envios', async (r) => {
  const ctx = await r.contexto();
  const pedido = r.consulta(ConsultaDaContagemDeEnvios);
  const contagem = await (await casosDeUsoDeComunicacao()).contagemDeEnvios(ctx, pedido);
  return r.responder(200, RespostaDaContagemDeEnvios, contagem);
});
