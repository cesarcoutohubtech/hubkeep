// GET /api/v1/chamados/{id}/linha-do-tempo — as ações da auditoria do chamado,
// das OS dele e das paradas do chamado, da mais antiga para a mais nova (C7).
// A auditoria é lida pela RLS: quem não a lê recebe a lista vazia. A montagem
// é a mesma da página do detalhe (servidor/leituras-do-chamado.ts, P1c).
import { RespostaDeLinhaDoTempo } from '@hubkeep/contratos';
import { ErroHttp, rota } from '../../../../../../servidor/http';
import { linhaDoTempoDoChamado } from '../../../../../../servidor/leituras-do-chamado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/linha-do-tempo\/?$/i;

export const GET = rota('chamados.linha_do_tempo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  return r.responder(200, RespostaDeLinhaDoTempo, await linhaDoTempoDoChamado(ctx, id));
});
