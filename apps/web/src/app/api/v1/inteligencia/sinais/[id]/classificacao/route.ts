// POST /api/v1/inteligencia/sinais/{id}/classificacao — uma pessoa classifica
// a reclamação de hóspede (ADR-047), com a versão que a tela viu. Nada liga a
// reclamação ao ativo sem uma pessoa.
import { PedidoDeClassificacaoDeSinal, RespostaDaClassificacaoDeSinal } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/sinais\/([0-9a-f-]{36})\/classificacao\/?$/i;

export const POST = rota('inteligencia.sinais.classificar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'sinal_nao_encontrado');
  const pedido = await r.corpo(PedidoDeClassificacaoDeSinal);
  const r1 = await (await casosDeUsoDoPainelDoIntelligence()).classificarSinal(ctx, id, pedido);
  return r.responder(200, RespostaDaClassificacaoDeSinal, r1);
});
