// Monitor de SLA (fase 1c; ADR-043): a política do escalonamento e os avisos
// devidos, no relógio 24x7 e no de atendimento, com a janela do atendimento
// (até a primeira OS), a da solução (até o serviço concluído) e o relógio
// parado pela pausa.
import { describe, expect, it } from 'vitest';
import {
  type ChamadoNoMonitor,
  ESCALONAMENTO_PADRAO,
  HORARIO_PADRAO,
  avisosDeSla,
  destinatariosDoAviso,
  escalonamentoValido,
} from '../src/index';

const H = 3_600_000;
const cal = {
  fuso: 'America/Sao_Paulo',
  horario: HORARIO_PADRAO,
  semAtendimento: new Set<string>(),
};
const urgente = { atendimentoHoras: 1, solucaoHoras: 10, relogio: '24x7' as const };
const ABERTO = new Date('2026-10-13T12:00:00Z');
const chamado = (c: Partial<ChamadoNoMonitor> = {}): ChamadoNoMonitor => ({
  estado: 'aberto',
  jaTeveOs: false,
  prazoAtendimento: new Date(ABERTO.getTime() + 1 * H),
  prazoSolucao: new Date(ABERTO.getTime() + 10 * H),
  relogioParado: false,
  ...c,
});
const avisos = (c: ChamadoNoMonitor, depoisDe: number, percentualDoAviso = 80) =>
  avisosDeSla({
    chamado: c,
    regra: urgente,
    calendario: cal,
    agora: new Date(ABERTO.getTime() + depoisDe),
    percentualDoAviso,
  }).map((a) => a.tipo);

describe('escalonamento (chamado.escalonamento)', () => {
  it('o padrão vale; percentual de 50 a 95, inteiro; destinatários da lista, sem repetir', () => {
    expect(escalonamentoValido(ESCALONAMENTO_PADRAO)).toBe(true);
    expect(escalonamentoValido({ ...ESCALONAMENTO_PADRAO, percentualDoAviso: 49 })).toBe(false);
    expect(escalonamentoValido({ ...ESCALONAMENTO_PADRAO, percentualDoAviso: 95.5 })).toBe(false);
    expect(escalonamentoValido({ ...ESCALONAMENTO_PADRAO, emRisco: [] })).toBe(false);
    expect(escalonamentoValido({ ...ESCALONAMENTO_PADRAO, vencido: ['tecnico'] })).toBe(false);
    expect(destinatariosDoAviso(ESCALONAMENTO_PADRAO, 'vencido')).toContain('gestor_csc');
    expect(destinatariosDoAviso(ESCALONAMENTO_PADRAO, 'em_risco')).not.toContain('gestor_csc');
  });
});

describe('avisos de SLA', () => {
  it('nada antes do aviso; em risco a 80%; vencido no prazo', () => {
    expect(avisos(chamado(), 0.5 * H)).toEqual([]);
    // 48 min: faltam 12 min do atendimento (20% de 1 h).
    expect(avisos(chamado(), 0.8 * H)).toEqual(['atendimento_em_risco']);
    expect(avisos(chamado(), 1 * H)).toEqual(['atendimento_vencido']);
    // 8 h: faltam 2 h da solução (20% de 10 h).
    expect(avisos(chamado(), 8 * H)).toEqual(['atendimento_vencido', 'solucao_em_risco']);
    expect(avisos(chamado(), 10 * H)).toEqual(['atendimento_vencido', 'solucao_vencida']);
  });

  it('o percentual vem da política', () => {
    expect(avisos(chamado(), 0.5 * H, 50)).toEqual(['atendimento_em_risco']);
    expect(avisos(chamado(), 0.9 * H, 95)).toEqual([]);
  });

  it('o atendimento só até a primeira OS; a solução até o serviço concluído', () => {
    expect(avisos(chamado({ jaTeveOs: true, estado: 'em_execucao' }), 9 * H)).toEqual([
      'solucao_em_risco',
    ]);
    expect(avisos(chamado({ jaTeveOs: true, estado: 'em_triagem' }), 2 * H)).toEqual([]);
    expect(avisos(chamado({ estado: 'aguardando_aceite', jaTeveOs: true }), 11 * H)).toEqual([]);
    expect(avisos(chamado({ estado: 'concluido', jaTeveOs: true }), 11 * H)).toEqual([]);
    expect(avisos(chamado({ estado: 'cancelado' }), 11 * H)).toEqual([]);
  });

  it('o relógio parado pela pausa congela o aviso da solução; o chamado sem prazo fica fora', () => {
    expect(
      avisos(chamado({ jaTeveOs: true, estado: 'em_execucao', relogioParado: true }), 11 * H),
    ).toEqual([]);
    expect(avisos(chamado({ prazoAtendimento: null, prazoSolucao: null }), 11 * H)).toEqual([]);
  });

  it('no horário de atendimento, o que falta é tempo de relógio, e a noite não conta', () => {
    // Abertura às 17h (São Paulo); 2 h e 10 h de atendimento.
    const abertura = new Date('2026-10-13T20:00:00Z');
    const prazoAtendimento = new Date('2026-10-14T12:00:00Z'); // quarta, 9h
    const media = { atendimentoHoras: 2, solucaoHoras: 10, relogio: 'atendimento' as const };
    const em = (iso: string) =>
      avisosDeSla({
        chamado: chamado({ prazoAtendimento, prazoSolucao: null }),
        regra: media,
        calendario: cal,
        agora: new Date(iso),
        percentualDoAviso: 80,
      }).map((a) => a.tipo);
    // 23h da terça: faltam 1 h de relógio (das 8h às 9h), mais que 24 min.
    expect(em('2026-10-14T02:00:00Z')).toEqual([]);
    // 8h40 da quarta: faltam 20 min.
    expect(em('2026-10-14T11:40:00Z')).toEqual(['atendimento_em_risco']);
    expect(abertura.getTime()).toBeLessThan(prazoAtendimento.getTime());
  });
});
