// POST /api/v1/membros/{usuarioId}/segundo-fator/remocao — remove o segundo
// fator do membro que perdeu o aparelho (SP1, ADR-049 e adendo ao ADR-024).
// Só o Admin do grupo, em aal2 (o portão do contexto), e nunca o próprio.
import { RespostaDeRemocaoDoSegundoFator } from '@hubkeep/contratos';
import { casoDeUsoDoSegundoFator } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/membros\/([0-9a-f-]{36})\/segundo-fator\/remocao\/?$/i;

export const POST = rota('membros.remover_segundo_fator', async (r) => {
  const ctx = await r.contexto();
  const usuarioId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!usuarioId) throw new ErroHttp(404, 'membro_nao_encontrado');
  const { removidos } = await (await casoDeUsoDoSegundoFator()).removerSegundoFator(ctx, usuarioId);
  return r.responder(200, RespostaDeRemocaoDoSegundoFator, { usuarioId, removidos });
});
