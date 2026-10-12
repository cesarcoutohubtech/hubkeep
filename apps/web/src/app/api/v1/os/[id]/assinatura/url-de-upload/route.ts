// POST /api/v1/os/{id}/assinatura/url-de-upload — URL assinada para enviar a
// assinatura do aceite (I8; ADR-024): um PNG novo na pasta da OS, só para quem
// pode aceitar a OS concluída agora. O caminho devolvido vai no aceite.
import { RespostaDeUrlDeUpload } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/assinatura\/url-de-upload\/?$/i;

export const POST = rota('os.url_da_assinatura', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const u = await (await casosDeUsoDeAnexos()).pedirUrlDaAssinatura(ctx, id);
  return r.responder(200, RespostaDeUrlDeUpload, { ...u, expiraEm: u.expiraEm.toISOString() });
});
