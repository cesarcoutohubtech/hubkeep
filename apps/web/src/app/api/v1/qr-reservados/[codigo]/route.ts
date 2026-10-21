// GET /api/v1/qr-reservados/{codigo} — o código lido de uma etiqueta
// reservada (M3): o hotel e se já tem ativo, para o PWA abrir o cadastro com
// ele. Não reservado, mal formado ou fora do escopo dá o mesmo 404.
import { RespostaDeCodigoReservado } from '@hubkeep/contratos';
import { casosDeUsoDeQrReservados } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/qr-reservados\/([^/]{1,40})\/?$/i;

export const GET = rota('qr_reservados.consultar', async (r) => {
  const ctx = await r.contexto();
  const codigo = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!codigo) throw new ErroHttp(404, 'qr_nao_reservado');
  const reserva = await (
    await casosDeUsoDeQrReservados()
  ).consultar(ctx, decodeURIComponent(codigo));
  return r.responder(200, RespostaDeCodigoReservado, reserva);
});
