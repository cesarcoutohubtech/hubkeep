// GET e POST /api/v1/hoteis/{id}/equipes — equipes do hotel (A6).
import { PedidoDeEquipe, RespostaDeEquipeAlterada, RespostaDeEquipes } from '@hubkeep/contratos';
import { casosDeUsoDeEquipes } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/equipes\/?$/i;
const hotelDa = (url: string) => {
  const id = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return id;
};

export const GET = rota('equipes.listar', async (r) => {
  const ctx = await r.contexto();
  const lista = await (await casosDeUsoDeEquipes()).listarEquipes(ctx, hotelDa(r.req.url));
  return r.responder(200, RespostaDeEquipes, lista);
});

export const POST = rota('equipes.criar', async (r) => {
  const ctx = await r.contexto();
  const hotelId = hotelDa(r.req.url);
  const { nome } = await r.corpo(PedidoDeEquipe);
  const criada = await (await casosDeUsoDeEquipes()).criarEquipe(ctx, hotelId, nome);
  return r.responder(201, RespostaDeEquipeAlterada, criada);
});
