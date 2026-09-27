// PUT /api/v1/proprietarios/{id} — altera nome e documento (A4). Só o Admin do grupo.
import { PedidoDeProprietario, RespostaDeProprietarioAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeProprietarios } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/proprietarios\/([0-9a-f-]{36})\/?$/i;

export const PUT = rota('proprietarios.alterar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'proprietario_nao_encontrado');
  const { nome, documento } = await r.corpo(PedidoDeProprietario);
  await (await casosDeUsoDeProprietarios()).alterarProprietario(ctx, id, nome, documento);
  return r.responder(200, RespostaDeProprietarioAlterado, { id });
});
