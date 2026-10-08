// PUT /api/v1/locais/{id} — altera nome e andar da área comum (B1) e, se vier,
// a edificação (I2; ausente, fica a gravada).
import { PedidoDeAreaComum, RespostaDeLocalAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeLocais } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/locais\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('locais.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'local_nao_encontrado');
  const { nome, andar, edificacao } = await r.corpo(PedidoDeAreaComum);
  await (await casosDeUsoDeLocais()).alterarAreaComum(ctx, id, nome, andar, edificacao);
  return r.responder(200, RespostaDeLocalAlterado, { id });
});
