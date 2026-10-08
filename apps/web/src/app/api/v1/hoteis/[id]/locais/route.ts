// GET /api/v1/hoteis/{id}/locais — UHs e áreas comuns do hotel, no escopo de
// quem pede (RLS), com a origem e se é editável (B1), e as edificações que já
// existem no hotel, para a tela sugerir (I2). ?busca= filtra por trecho, sem
// acento, no nome e na edificação (B6, I2); as edificações vêm sem o filtro.
// POST /api/v1/hoteis/{id}/locais — cadastra uma área comum (B1), com a
// edificação opcional (I2).
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
  const busca = new URL(r.req.url).searchParams.get('busca');
  const hotelId = hotelDa(r.req.url);
  const casos = await casosDeUsoDeLocais();
  const locais = await casos.listarLocais(ctx, hotelId, busca);
  return r.responder(200, RespostaDeLocaisDoHotel, {
    locais: locais.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      andar: l.andar,
      edificacao: l.edificacao,
      status: l.status,
      origem: l.origem,
      editavel: l.editavel,
    })),
    edificacoes: await casos.edificacoesDoHotel(ctx, hotelId),
  });
});

export const POST = rota('locais.criar_area_comum', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDa(r.req.url);
  const { nome, andar, edificacao } = await r.corpo(PedidoDeAreaComum);
  const { id } = await (
    await casosDeUsoDeLocais()
  ).criarAreaComum(ctx, hotelId, nome, andar, edificacao);
  return r.responder(201, RespostaDeLocalAlterado, { id });
});
