// POST /api/v1/anexos/{id}/url-de-download — URL de 5 minutos para o arquivo ou
// a miniatura de um anexo registrado. A RLS de app.anexo decide quem o vê, o
// proprietário inclusive (B4). Fora do escopo, 404.
import { PedidoDeUrlDoAnexo, RespostaDeUrlDeDownload } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/anexos\/([0-9a-f-]{36})\/url-de-download\/?$/i;

export const POST = rota('anexos.url_do_anexo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'anexo_nao_encontrado');
  const { miniatura } = await r.corpo(PedidoDeUrlDoAnexo);
  const d = await (await casosDeUsoDeAnexos()).pedirUrlDoAnexo(ctx, id, miniatura);
  return r.responder(200, RespostaDeUrlDeDownload, { ...d, expiraEm: d.expiraEm.toISOString() });
});
