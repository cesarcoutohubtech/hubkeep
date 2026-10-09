// GET /api/v1/os/do-dia — a fila do dia do Técnico (C4): as OS dele e das
// equipes dele ainda em curso, que o PWA guarda no aparelho (ADR-025).
import { ESTADOS_DA_OS_API, ESTADOS_DO_CHAMADO_API, RespostaDeOsDoDia } from '@hubkeep/contratos';
import { casosDeUsoDeExecucao } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('os.do_dia', async (r) => {
  const ctx = await r.contexto();
  const os = await (await casosDeUsoDeExecucao()).osDoDia(ctx);
  return r.responder(200, RespostaDeOsDoDia, {
    os: os.map((o) => ({
      id: o.id,
      hotelId: o.hotelId,
      estado: o.estado as (typeof ESTADOS_DA_OS_API)[number],
      situacaoId: o.situacaoId,
      responsavel: o.responsavel,
      motivoReabertura: o.motivoReabertura,
      versao: o.versao,
      criadoEm: o.criadoEm.toISOString(),
      chamado: {
        ...o.chamado,
        estado: o.chamado.estado as (typeof ESTADOS_DO_CHAMADO_API)[number],
        paradoDesde: o.chamado.paradoDesde?.toISOString() ?? null,
        uhIndisponivelDesde: o.chamado.uhIndisponivelDesde?.toISOString() ?? null,
      },
    })),
  });
});
