// GET /api/v1/os/do-dia — a fila do dia do Técnico (C4): as OS dele e das
// equipes dele ainda em curso, que o PWA guarda no aparelho (ADR-025), com o
// checklist de cada uma e a política do hotel (PV1). A OS preventiva (PV3), sem
// chamado, só vem com preventiva=1, para não derrubar o PWA antigo.
import {
  ConsultaDaFilaDoDia,
  ESTADOS_DA_OS_API,
  ESTADOS_DO_CHAMADO_API,
  RespostaDeOsDoDia,
} from '@hubkeep/contratos';
import { casosDeUsoDeExecucao } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('os.do_dia', async (r) => {
  const ctx = await r.contexto();
  const { preventiva } = r.consulta(ConsultaDaFilaDoDia);
  const os = await (await casosDeUsoDeExecucao()).osDoDia(ctx, { preventiva: preventiva === '1' });
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
      fotosDepois: o.fotosDepois,
      fotoDepoisObrigatoria: o.fotoDepoisObrigatoria,
      checklist: o.checklist && {
        id: o.checklist.id,
        modeloId: o.checklist.modeloId,
        modeloVersao: o.checklist.modeloVersao,
        nomes: o.checklist.nomes,
        itens: o.checklist.itens,
        respostas: o.checklist.respostas,
      },
      checklistCompletoObrigatorio: o.checklistCompletoObrigatorio,
      chamado: o.chamado && {
        ...o.chamado,
        estado: o.chamado.estado as (typeof ESTADOS_DO_CHAMADO_API)[number],
        paradoDesde: o.chamado.paradoDesde?.toISOString() ?? null,
        uhIndisponivelDesde: o.chamado.uhIndisponivelDesde?.toISOString() ?? null,
      },
      preventiva: o.preventiva,
    })),
  });
});
