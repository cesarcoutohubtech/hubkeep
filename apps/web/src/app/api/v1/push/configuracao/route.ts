// GET /api/v1/push/configuracao — a chave pública VAPID do push do PWA (1c,
// ADR-046, C4), para o aparelho se inscrever; null: o push não está ligado.
import { ConfiguracaoDoPushApi } from '@hubkeep/contratos';
import { casosDeUsoDePush } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('push.configuracao', async (r) => {
  await r.contexto();
  return r.responder(200, ConfiguracaoDoPushApi, (await casosDeUsoDePush()).configuracao());
});
