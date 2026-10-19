// POST /api/v1/inteligencia/sinais/{id}/chamado — abre o chamado a partir da
// reclamação de hóspede (adendo de 19/10/2026 ao ADR-047): pelo caso de uso do
// núcleo, como qualquer chamado, e depois liga a reclamação a ele.
import { PedidoDeChamadoDaReclamacao, RespostaDoChamadoDaReclamacao } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/sinais\/([0-9a-f-]{36})\/chamado\/?$/i;

export const POST = rota('inteligencia.sinais.abrir_chamado', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'sinal_nao_encontrado');
  const pedido = await r.corpo(PedidoDeChamadoDaReclamacao);
  const aberto = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).abrirChamadoDaReclamacao(ctx, id, pedido);
  return r.responder(201, RespostaDoChamadoDaReclamacao, aberto);
});
