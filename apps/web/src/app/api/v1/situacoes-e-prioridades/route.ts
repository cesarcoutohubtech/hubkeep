// GET /api/v1/situacoes-e-prioridades — situações e prioridades do tenant (C1; ADR-027).
import { RespostaDeSituacoesEPrioridades } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('situacoes.listar', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeSituacoesEPrioridades,
    await (await casosDeUsoDeSituacoes()).listarSituacoesEPrioridades(ctx),
  );
});
