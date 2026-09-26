// POST /api/v1/anexos/url-de-upload — URL assinada para o aparelho enviar o
// arquivo direto ao Storage (F0-10, ADR-024). O caminho é calculado pela API
// depois da checagem de escopo; o cliente só diz o registro e o tipo.
import { PedidoDeUrlDeUpload, RespostaDeUrlDeUpload } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('anexos.url_de_upload', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeUrlDeUpload);
  const u = await (await casosDeUsoDeAnexos()).pedirUrlDeUpload(ctx, pedido);
  return r.responder(200, RespostaDeUrlDeUpload, { ...u, expiraEm: u.expiraEm.toISOString() });
});
