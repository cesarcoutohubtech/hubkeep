// GET /api/v1/chamados/{id} — o chamado e as OS dele, como a RLS os mostra a
// quem pede (C2, C3), com os nomes que o detalhe mostra (C7). A montagem é a
// mesma da página do detalhe, no servidor (servidor/leituras-do-chamado.ts, P1c).
import { RespostaDeChamado } from '@hubkeep/contratos';
import { ErroHttp, rota } from '../../../../../servidor/http';
import { detalheDoChamado } from '../../../../../servidor/leituras-do-chamado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('chamados.ler', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  return r.responder(200, RespostaDeChamado, await detalheDoChamado(ctx, id));
});
