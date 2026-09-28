// GET /api/v1/hoteis/{id}/locais — UHs e áreas comuns do hotel, no escopo de
// quem pede (RLS), com a origem e se é editável (B1).
// POST /api/v1/hoteis/{id}/locais — cadastra uma área comum (B1).
import {
  PedidoDeAreaComum,
  RespostaDeLocaisDoHotel,
  RespostaDeLocalAlterado,
} from '@hubkeep/contratos';
import { casosDeUsoDeLocais } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/locais\/?$/i;

const hotelDa = (url: string) => {
  const id = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return id;
};

export const GET = rota('locais.listar', async (r) => {
  const ctx = await r.contexto();
  const locais = await (await casosDeUsoDeLocais()).listarLocais(ctx, hotelDa(r.req.url));
  return r.responder(200, RespostaDeLocaisDoHotel, {
    locais: locais.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      andar: l.andar,
      status: l.status,
      origem: l.origem,
      editavel: l.editavel,
    })),
  });
});

export const POST = rota('locais.criar_area_comum', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDa(r.req.url);
  const { nome, andar } = await r.corpo(PedidoDeAreaComum);
  const { id } = await (await casosDeUsoDeLocais()).criarAreaComum(ctx, hotelId, nome, andar);
  return r.responder(201, RespostaDeLocalAlterado, { id });
});
