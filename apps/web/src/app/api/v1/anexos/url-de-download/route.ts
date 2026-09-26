// POST /api/v1/anexos/url-de-download — URL assinada de 5 minutos para um anexo
// do escopo do usuário (F0-10, ADR-024). Fora do escopo, 404.
import { PedidoDeUrlDeDownload, RespostaDeUrlDeDownload } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('anexos.url_de_download', async (r) => {
  const ctx = await r.contexto();
  const { caminho } = await r.corpo(PedidoDeUrlDeDownload);
  const d = await (await casosDeUsoDeAnexos()).pedirUrlDeDownload(ctx, caminho);
  return r.responder(200, RespostaDeUrlDeDownload, { ...d, expiraEm: d.expiraEm.toISOString() });
});
