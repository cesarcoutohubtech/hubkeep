// Monitor de SLA (fase 1c; ADR-043): a política do escalonamento e os avisos
// devidos, no relógio 24x7 e no de atendimento, com a janela do atendimento
// (até a primeira OS), a da solução (até o serviço concluído) e o relógio
// parado pela pausa.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type ChamadoNoMonitor,
  ESCALONAMENTO_PADRAO,
  HORARIO_PADRAO,
  avisosDeSla,
  avisosEmAberto,
  destinatariosDoAviso,
  escalonamentoValido,
  podeVerAvisosDeSla,
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
  it('nada antes do aviso; em risco a 80%; vencido só depois do prazo', () => {
    expect(avisos(chamado(), 0.5 * H)).toEqual([]);
    // 48 min: faltam 12 min do atendimento (20% de 1 h).
    expect(avisos(chamado(), 0.8 * H)).toEqual(['atendimento_em_risco']);
    // No instante do prazo, ainda dentro ("dentro do prazo" é inclusive).
    expect(avisos(chamado(), 1 * H)).toEqual(['atendimento_em_risco']);
    expect(avisos(chamado(), 1 * H + 1)).toEqual(['atendimento_vencido']);
    // 8 h: faltam 2 h da solução (20% de 10 h).
    expect(avisos(chamado(), 8 * H)).toEqual(['atendimento_vencido', 'solucao_em_risco']);
    expect(avisos(chamado(), 10 * H + 1)).toEqual(['atendimento_vencido', 'solucao_vencida']);
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

describe('avisos em aberto (painel e selo da ficha, M4)', () => {
  const PA = chamado().prazoAtendimento as Date;
  const PS = chamado().prazoSolucao as Date;
  const emAberto = (
    c: ChamadoNoMonitor,
    gravados: {
      tipo: Parameters<typeof avisosEmAberto>[0]['gravados'][number]['tipo'];
      prazo: Date;
    }[],
    depoisDe: number,
  ) =>
    avisosEmAberto({ chamado: c, gravados, agora: new Date(ABERTO.getTime() + depoisDe) }).map(
      (a) => `${a.tipo}:${a.nivel}`,
    );

  it('sem aviso gravado e antes do prazo, nada; o em risco vem do gravado', () => {
    expect(emAberto(chamado(), [], 0.5 * H)).toEqual([]);
    expect(emAberto(chamado(), [{ tipo: 'atendimento_em_risco', prazo: PA }], 0.9 * H)).toEqual([
      'atendimento_em_risco:em_risco',
    ]);
  });

  it('o prazo passado é vencido sem esperar o cron; no instante do prazo, não', () => {
    expect(emAberto(chamado(), [], 1 * H)).toEqual([]);
    expect(emAberto(chamado(), [{ tipo: 'atendimento_em_risco', prazo: PA }], 1 * H + 1)).toEqual([
      'atendimento_vencido:vencido',
    ]);
  });

  it('o aviso de um prazo que foi refeito não conta mais', () => {
    const antigo = new Date(PS.getTime() - 2 * H);
    const comOs = chamado({ estado: 'em_execucao', jaTeveOs: true });
    expect(emAberto(comOs, [{ tipo: 'solucao_em_risco', prazo: antigo }], 2 * H)).toEqual([]);
  });

  it('o atendimento some com a OS; a solução, com o serviço concluído', () => {
    const gravados = [
      { tipo: 'atendimento_vencido' as const, prazo: PA },
      { tipo: 'solucao_em_risco' as const, prazo: PS },
    ];
    expect(emAberto(chamado({ estado: 'em_execucao', jaTeveOs: true }), gravados, 9 * H)).toEqual([
      'solucao_em_risco:em_risco',
    ]);
    expect(
      emAberto(chamado({ estado: 'aguardando_aceite', jaTeveOs: true }), gravados, 11 * H),
    ).toEqual([]);
  });
});

describe('avisos em aberto com o relógio parado (M4)', () => {
  it('a pausa que parou o relógio congela o vencido da solução; o gravado continua', () => {
    const PS = chamado().prazoSolucao as Date;
    const parado = chamado({ estado: 'em_execucao', jaTeveOs: true, relogioParado: true });
    const agora = new Date(PS.getTime() + H);
    expect(avisosEmAberto({ chamado: parado, gravados: [], agora })).toEqual([]);
    expect(
      avisosEmAberto({
        chamado: parado,
        gravados: [{ tipo: 'solucao_em_risco', prazo: PS }],
        agora,
      }).map((a) => a.tipo),
    ).toEqual(['solucao_em_risco']);
  });
});

describe('quem vê os avisos (M4)', () => {
  const hotel = { id: 'h1', bandeiraId: null };
  const agora = new Date('2026-10-13T12:00:00Z');
  const papel = (p: Atribuicao['papel']): Atribuicao => ({
    id: 'a1',
    usuarioId: 'u1',
    papel: p,
    escopo: { tipo: 'hotel', hotelId: 'h1' },
    validoAte: null,
    revogadoEm: null,
  });

  it('a gestão do hotel vê; o técnico e o implantador, não', () => {
    expect(podeVerAvisosDeSla([papel('gerente_hotel')], hotel, agora).permitido).toBe(true);
    expect(podeVerAvisosDeSla([papel('tecnico')], hotel, agora).permitido).toBe(false);
    const negado = podeVerAvisosDeSla([papel('implantador')], hotel, agora);
    expect(negado.permitido ? null : negado.erro.codigo).toBe('avisos_sla_fora_do_escopo');
  });
});
