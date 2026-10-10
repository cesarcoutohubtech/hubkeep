// PUT /api/v1/codigos-de-manutencao/{id} — altera os nomes (I6). O tipo e a
// categoria não mudam: para mudar, cria-se outro e desativa-se este.
import { PedidoDeNomesDeCodigo, RespostaDeCodigoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeCodigos } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/codigos-de-manutencao\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('codigos.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'codigo_nao_encontrado');
  const { nomes } = await r.corpo(PedidoDeNomesDeCodigo);
  await (await casosDeUsoDeCodigos()).alterarCodigo(ctx, id, nomes);
  return r.responder(200, RespostaDeCodigoAlterado, { id });
});
