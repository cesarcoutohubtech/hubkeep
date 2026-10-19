// GET /api/v1/ativos/qr/{codigo} — abre o ativo pelo código do QR individual
// (B5), no escopo de quem pede (RLS). Código mal formado, de outro tenant ou
// fora do escopo dá o mesmo 404, sem distinguir os casos.
import { RespostaDeAtivoDoQr } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/qr\/([^/]{1,40})\/?$/i;

export const GET = rota('ativos.abrir_por_qr', async (r) => {
  const ctx = await r.contexto();
  const codigo = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!codigo) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const a = await (await casosDeUsoDeAtivos()).abrirPorCodigoQr(ctx, decodeURIComponent(codigo));
  return r.responder(200, RespostaDeAtivoDoQr, {
    hotelId: a.hotelId,
    ativo: {
      id: a.id,
      localId: a.localId,
      categoriaId: a.categoriaId,
      modeloId: a.modeloId,
      nome: a.nome,
      fabricante: a.fabricante,
      modelo: a.modelo,
      numeroSerie: a.numeroSerie,
      dataCompra: a.dataCompra,
      garantiaAte: a.garantiaAte,
      criticidade: a.criticidade,
      campos: a.campos,
      versao: a.versao,
      ativo: a.desativadoEm === null,
      codigoQr: a.codigoQr,
      paradoDesde: a.paradoDesde?.toISOString() ?? null,
    },
  });
});
