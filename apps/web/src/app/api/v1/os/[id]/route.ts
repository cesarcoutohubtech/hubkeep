// GET /api/v1/os/{id} — a OS por id, como a RLS a mostra a quem pede: a
// corretiva ou a preventiva (PV3c), com os nomes da página da OS
// (servidor/leituras-da-os.ts).
import { RespostaDeOs } from '@hubkeep/contratos';
import { ErroHttp, rota } from '../../../../../servidor/http';
import { detalheDaOs } from '../../../../../servidor/leituras-da-os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('os.ler', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  return r.responder(200, RespostaDeOs, await detalheDaOs(ctx, id));
});
