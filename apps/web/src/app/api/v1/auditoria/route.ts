// GET /api/v1/auditoria?entidade=&registroId= — o histórico de um hotel, local,
// ativo, chamado ou OS (D1): quem gravou, quando, a ação e o antes e o depois
// de cada campo. Quem não vê o registro recebe 404; das linhas, a RLS de
// app.auditoria mostra só as que quem pede lê.
import { ConsultaDoHistorico, RespostaDoHistorico } from '@hubkeep/contratos';
import { casosDeUsoDeHistorico } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('auditoria.historico', async (r) => {
  const ctx = await r.contexto();
  const { entidade, registroId } = r.consulta(ConsultaDoHistorico);
  const h = await (await casosDeUsoDeHistorico()).historico(ctx, entidade, registroId);
  return r.responder(200, RespostaDoHistorico, {
    ...h,
    eventos: h.eventos.map((e) => ({ ...e, em: e.em.toISOString() })),
  });
});
