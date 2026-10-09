// POST /api/v1/uh-indisponivel/{id}/liberacao — libera a UH (I4): encerra o
// período aberto, pela gestão do hotel (Admin do grupo, Gestor CSC, Gerente);
// sem fim, agora. Quem conclui a OS libera na conclusão, pela operação offline.
import { PedidoDeLiberacaoDeUh, RespostaDeUhLiberada } from '@hubkeep/contratos';
import { casosDeUsoDeUhIndisponivel } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/uh-indisponivel\/([0-9a-f-]{36})\/liberacao\/?$/i;

export const POST = rota('uh_indisponivel.liberar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'uh_indisponivel_nao_encontrada');
  const pedido = await r.corpo(PedidoDeLiberacaoDeUh);
  const { fim } = await (
    await casosDeUsoDeUhIndisponivel()
  ).liberar(ctx, id, {
    fim: pedido.fim ? new Date(pedido.fim) : null,
  });
  return r.responder(200, RespostaDeUhLiberada, { id, fim: fim.toISOString() });
});
