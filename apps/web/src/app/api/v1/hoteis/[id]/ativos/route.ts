// GET /api/v1/hoteis/{id}/ativos — ativos do hotel, no escopo de quem pede
// (RLS; o proprietário vê só os dos locais dele), com os campos estendidos
// lidos pela definição atual da categoria (B3). ?busca= filtra por trecho, sem
// acento (B6).
import { RespostaDeAtivosDoHotel } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/ativos\/?$/i;

export const GET = rota('ativos.listar', async (r) => {
  const ctx = await r.contexto();
  const url = new URL(r.req.url);
  const hotelId = CAMINHO.exec(url.pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const busca = url.searchParams.get('busca');
  const ativos = await (await casosDeUsoDeAtivos()).listarAtivos(ctx, hotelId, busca);
  return r.responder(200, RespostaDeAtivosDoHotel, {
    ativos: ativos.map((a) => ({
      id: a.id,
      localId: a.localId,
      categoriaId: a.categoriaId,
      nome: a.nome,
      fabricante: a.fabricante,
      modelo: a.modelo,
      numeroSerie: a.numeroSerie,
      campos: a.campos,
      versao: a.versao,
      ativo: a.desativadoEm === null,
      codigoQr: a.codigoQr,
      paradoDesde: a.paradoDesde?.toISOString() ?? null,
    })),
  });
});
