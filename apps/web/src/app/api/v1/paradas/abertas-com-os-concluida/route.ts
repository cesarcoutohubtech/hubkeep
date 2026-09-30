// GET /api/v1/paradas/abertas-com-os-concluida — as paradas que ficaram
// abertas depois da conclusão da OS do chamado, para o Admin do grupo, o
// Gestor CSC e o Gerente do hotel acompanharem e encerrarem (C5).
import { RespostaDeParadasPendentes } from '@hubkeep/contratos';
import { casosDeUsoDeParadas } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('paradas.pendentes', async (r) => {
  const ctx = await r.contexto();
  const paradas = await (await casosDeUsoDeParadas()).abertasComOsConcluida(ctx);
  return r.responder(200, RespostaDeParadasPendentes, {
    paradas: paradas.map((p) => ({
      id: p.id,
      hotelId: p.hotelId,
      ativoId: p.ativoId,
      ativoNome: p.ativoNome,
      chamadoId: p.chamadoId,
      osId: p.os.id,
      osEstado: p.os.estado as 'concluida' | 'aceita',
      inicio: p.inicio.toISOString(),
      tempoParadoMs: p.tempoParadoMs,
    })),
  });
});
