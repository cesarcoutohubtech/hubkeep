// POST /api/v1/sincronizacao/operacoes — uma operação feita offline no PWA
// (F0-11, ADR-025). A chave vem do aparelho; repetida, devolve a resposta
// guardada com repetida: true e não aplica de novo. Inválida, 422 sem guardar
// a chave (o aparelho descarta a operação).
import { PedidoDeOperacaoOffline, RespostaDeOperacaoOffline } from '@hubkeep/contratos';
import { casosDeUsoDeSincronizacao } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('sincronizacao.operacao', async (r) => {
  const ctx = await r.contexto();
  const operacao = await r.corpo(PedidoDeOperacaoOffline);
  const resultado = await (await casosDeUsoDeSincronizacao()).receberOperacao(ctx, operacao);
  return r.responder(resultado.repetida ? 200 : 201, RespostaDeOperacaoOffline, resultado);
});
