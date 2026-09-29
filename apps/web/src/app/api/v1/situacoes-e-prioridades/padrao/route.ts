// POST /api/v1/situacoes-e-prioridades/padrao — instala as situações e
// prioridades padrão do catálogo que o tenant ainda não tem (C1). Idempotente.
// Só o Admin do grupo.
import { RespostaDeSituacoesEPrioridadesPadrao } from '@hubkeep/contratos';
import { casosDeUsoDeSituacoes } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('situacoes.instalar_padrao', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeSituacoesEPrioridadesPadrao,
    await (await casosDeUsoDeSituacoes()).instalarPadrao(ctx),
  );
});
