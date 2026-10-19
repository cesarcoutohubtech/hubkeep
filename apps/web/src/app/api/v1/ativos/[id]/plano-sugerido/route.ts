// POST /api/v1/ativos/{id}/plano-sugerido — cria o plano sugerido do ativo com um clique: pausado e sem responsável (M1, caminho C).
import { RespostaDePlanoAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeSugestoesDePlano } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/plano-sugerido\/?$/i;

export const POST = rota('sugestoes_de_plano.criar_plano', async (r) => {
  const ctx = await r.contexto();
  const ativoId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!ativoId) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const criado = await (await casosDeUsoDeSugestoesDePlano()).criarPlano(ctx, ativoId);
  return r.responder(201, RespostaDePlanoAlterado, criado);
});
