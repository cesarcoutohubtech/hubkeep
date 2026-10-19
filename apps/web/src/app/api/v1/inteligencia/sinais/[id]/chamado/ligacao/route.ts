// POST /api/v1/inteligencia/sinais/{id}/chamado/ligacao — liga de novo a
// reclamação ao chamado que quem pede abriu a partir dela, quando a ligação
// falhou depois da abertura (chamado_sem_ligacao).
import { PedidoDeLigacaoDoChamado, RespostaDoChamadoDaReclamacao } from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/inteligencia\/sinais\/([0-9a-f-]{36})\/chamado\/ligacao\/?$/i;

export const POST = rota('inteligencia.sinais.ligar_chamado', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'sinal_nao_encontrado');
  const { chamadoId } = await r.corpo(PedidoDeLigacaoDoChamado);
  await (await casosDeUsoDoPainelDoIntelligence()).ligarChamadoDaReclamacao(ctx, id, chamadoId);
  return r.responder(200, RespostaDoChamadoDaReclamacao, { chamadoId });
});
