// Monitor de SLA (fase 1c; ADR-043), com a porta em memória: a regra sai da
// cópia do chamado; o percentual e os destinatários, da política do hotel; o
// aviso já emitido para o prazo não sai de novo; a pausa que parou o relógio
// congela a solução; o chamado sem cópia fica fora. O SQL, a chave única e o
// outbox são do teste de integração (packages/db/test/monitor-sla.test.ts).
import { ESCALONAMENTO_PADRAO, HORARIO_PADRAO, SLA_PADRAO } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type AvisoAEmitir, type ChamadoParaMonitor, criarMonitorDeSla } from '../src/index';

const H = 3_600_000;
const AGORA = new Date('2026-10-13T20:00:00Z');
const P = '0193f0a0-0000-7000-8000-0000000000aa';
const CAT = '0193f0a0-0000-7000-8000-000000000001';
const copia = {
  'chamado.sla': {
    ...SLA_PADRAO,
    porPrioridade: { urgente: { atendimentoHoras: 1, solucaoHoras: 10, relogio: '24x7' } },
    porCategoria: { [CAT]: { pausa: true } },
  },
  'hotel.horario_atendimento': HORARIO_PADRAO,
};
const chamado = (c: Partial<ChamadoParaMonitor>): ChamadoParaMonitor => ({
  id: 'c1',
  hotelId: 'h1',
  estado: 'aberto',
  prioridadeId: P,
  categoriaId: CAT,
  politicaAplicada: copia,
  prazoAtendimento: new Date(AGORA.getTime() + 0.1 * H),
  prazoSolucao: new Date(AGORA.getTime() + 9 * H),
  jaTeveOs: false,
  pausaEmCurso: null,
  emitidos: [],
  ...c,
});

function monitor(chamados: ChamadoParaMonitor[], escalonamento: unknown = undefined) {
  const emitidos: AvisoAEmitir[] = [];
  const rodar = criarMonitorDeSla({
    monitor: {
      emSessao: (_t, fn) =>
        fn({
          chamadosEmCurso: async () => chamados,
          prioridades: async () => [{ id: P, chavePadrao: 'urgente', peso: 40 }],
          politica: async (hotelId) =>
            hotelId === 'h2' && escalonamento ? { hotel: escalonamento } : {},
          calendario: async () => ({
            fuso: 'America/Sao_Paulo',
            hotel: { pais: null, subdivisao: null },
            tenant: { pais: 'BR', subdivisao: null },
            feriados: [],
          }),
          emitir: async (a) => {
            emitidos.push(a);
            return true;
          },
        }),
    },
    feriadosOficiais: { doAno: () => [] },
    relogio: { agora: () => AGORA },
  });
  return { rodar, emitidos };
}

describe('monitor de SLA (caso de uso)', () => {
  it('emite o aviso devido, com o nível e os destinatários da política', async () => {
    const { rodar, emitidos } = monitor([chamado({})]);
    expect(await rodar('t')).toEqual({ avaliados: 1, emitidos: 1 });
    expect(emitidos).toEqual([
      expect.objectContaining({
        chamadoId: 'c1',
        tipo: 'atendimento_em_risco',
        nivel: 'em_risco',
        destinatarios: ESCALONAMENTO_PADRAO.emRisco,
      }),
    ]);
  });

  it('o aviso já emitido para o prazo não sai de novo', async () => {
    const { rodar, emitidos } = monitor([chamado({ emitidos: ['atendimento_em_risco'] })]);
    expect(await rodar('t')).toEqual({ avaliados: 1, emitidos: 0 });
    expect(emitidos).toEqual([]);
  });

  it('o percentual vem da política do hotel', async () => {
    const e = { ...ESCALONAMENTO_PADRAO, percentualDoAviso: 50 };
    const solucao = { jaTeveOs: true, estado: 'em_execucao' as const };
    // Faltam 4 h de 10 h: só avisa com o percentual de 50% (folga de 5 h).
    const prazoSolucao = new Date(AGORA.getTime() + 4 * H);
    const { rodar, emitidos } = monitor(
      [
        chamado({ id: 'c1', hotelId: 'h1', prazoSolucao, ...solucao }),
        chamado({ id: 'c2', hotelId: 'h2', prazoSolucao, ...solucao }),
      ],
      e,
    );
    await rodar('t');
    expect(emitidos.map((a) => [a.chamadoId, a.tipo])).toEqual([['c2', 'solucao_em_risco']]);
  });

  it('a pausa com motivo da lista congela a solução; sem motivo, não', async () => {
    const vencida = {
      jaTeveOs: true,
      estado: 'em_execucao' as const,
      prazoSolucao: new Date(AGORA.getTime() - H),
    };
    const parado = monitor([chamado({ ...vencida, pausaEmCurso: { motivo: 'aguardando_peca' } })]);
    await parado.rodar('t');
    expect(parado.emitidos).toEqual([]);
    const semMotivo = monitor([chamado({ ...vencida, pausaEmCurso: { motivo: null } })]);
    await semMotivo.rodar('t');
    expect(semMotivo.emitidos.map((a) => a.tipo)).toEqual(['solucao_vencida']);
  });

  it('o chamado sem cópia do SLA fica fora', async () => {
    const { rodar, emitidos } = monitor([chamado({ politicaAplicada: {} })]);
    expect(await rodar('t')).toEqual({ avaliados: 1, emitidos: 0 });
    expect(emitidos).toEqual([]);
  });
});
