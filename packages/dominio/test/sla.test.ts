// Calendário de SLA (fase 1c; ADR-042): a regra do chamado, os dias sem
// atendimento e o cálculo dos prazos, com a virada de dia, o fim de semana, o
// intervalo de almoço, o feriado, o fuso do hotel e o horário de verão (o de
// São Paulo de 2018, real, pela base de fusos).
import { describe, expect, it } from 'vitest';
import {
  type CalendarioDeSla,
  HORARIO_PADRAO,
  type HorarioDeAtendimento,
  POLITICAS,
  type PoliticaDeSla,
  type PrioridadeParaSla,
  SLA_PADRAO,
  calcularPrazo,
  datasSemAtendimento,
  horasDeRelogioEntre,
  pausaParaORelogio,
  prazoNaRetomada,
  regraDeSla,
  registroDePoliticas,
  tempoDeRelogioEntre,
} from '../src/index';

const H = 3_600_000;
const SP = 'America/Sao_Paulo';
const cal = (
  fuso: string,
  semAtendimento: string[] = [],
  horario: HorarioDeAtendimento = HORARIO_PADRAO,
): CalendarioDeSla => ({ fuso, horario, semAtendimento: new Set(semAtendimento) });
const em = (iso: string) => new Date(iso);
const TODO_DIA: HorarioDeAtendimento = {
  dom: [{ inicio: '00:00', fim: '24:00' }],
  seg: [{ inicio: '00:00', fim: '24:00' }],
  ter: [{ inicio: '00:00', fim: '24:00' }],
  qua: [{ inicio: '00:00', fim: '24:00' }],
  qui: [{ inicio: '00:00', fim: '24:00' }],
  sex: [{ inicio: '00:00', fim: '24:00' }],
  sab: [{ inicio: '00:00', fim: '24:00' }],
};

describe('políticas do SLA', () => {
  it('os padrões valem no próprio formato, e o prefixo hotel. é do núcleo', () => {
    expect(POLITICAS['chamado.sla'].valido(SLA_PADRAO)).toBe(true);
    expect(POLITICAS['hotel.horario_atendimento'].valido(HORARIO_PADRAO)).toBe(true);
    expect(POLITICAS['hotel.horario_atendimento'].valido(TODO_DIA)).toBe(true);
    expect(() =>
      registroDePoliticas([
        { prefixo: 'hotel.', chaves: ['hotel.x'], padrao: () => 1, valido: () => true },
      ]),
    ).toThrow();
    expect(registroDePoliticas([]).resolver('chamado.sla', {})).toEqual(SLA_PADRAO);
  });
});

describe('regra do chamado', () => {
  const P = {
    urgente: { id: '0193a000-0000-4000-8000-000000000001', chavePadrao: 'urgente', peso: 100 },
    alta: { id: '0193a000-0000-4000-8000-000000000002', chavePadrao: 'alta', peso: 70 },
    critica: { id: '0193a000-0000-4000-8000-000000000005', chavePadrao: null, peso: 90 },
    empate: { id: '0193a000-0000-4000-8000-000000000006', chavePadrao: null, peso: 85 },
    leve: { id: '0193a000-0000-4000-8000-000000000007', chavePadrao: null, peso: 25 },
    media: { id: '0193a000-0000-4000-8000-000000000003', chavePadrao: 'media', peso: 40 },
    baixa: { id: '0193a000-0000-4000-8000-000000000004', chavePadrao: 'baixa', peso: 10 },
  } satisfies Record<string, PrioridadeParaSla>;
  const prioridades = Object.values(P);
  const CATEGORIA = '0193a000-0000-4000-8000-0000000000c1';
  const sla: PoliticaDeSla = {
    ...SLA_PADRAO,
    porPrioridade: {
      ...SLA_PADRAO.porPrioridade,
      [P.alta.id]: { atendimentoHoras: 3, solucaoHoras: 9, relogio: 'atendimento' },
    },
    porCategoria: { [CATEGORIA]: { relogio: '24x7', solucaoHoras: 4, pausa: true } },
  };
  const regra = (prioridade: PrioridadeParaSla, categoriaId: string | null = null) =>
    regraDeSla({ sla, prioridade, prioridades, categoriaId });

  it('pelo id da prioridade, senão pela chave padrão', () => {
    expect(regra(P.alta)).toEqual({
      atendimentoHoras: 3,
      solucaoHoras: 9,
      relogio: 'atendimento',
      pausa: false,
      origem: 'prioridade',
      daCategoria: false,
    });
    expect(regra(P.urgente)).toMatchObject({
      solucaoHoras: 2,
      relogio: '24x7',
      origem: 'chave_padrao',
    });
  });

  it('sem linha, a do peso mais próximo; no empate, a de peso maior', () => {
    expect(regra(P.critica)).toMatchObject({ solucaoHoras: 2, origem: 'peso' });
    expect(regra(P.empate)).toMatchObject({ solucaoHoras: 2, origem: 'peso' });
    expect(regra(P.leve)).toMatchObject({ solucaoHoras: 24, relogio: 'atendimento' });
  });

  it('linha só de prioridade que não existe mais: vale o padrão de fábrica pelo peso', () => {
    const soUmId: PoliticaDeSla = {
      ...SLA_PADRAO,
      porPrioridade: {
        '0193a000-0000-4000-8000-0000000000ff': {
          atendimentoHoras: 1,
          solucaoHoras: 1,
          relogio: '24x7',
        },
      },
    };
    expect(
      regraDeSla({ sla: soUmId, prioridade: P.media, prioridades, categoriaId: null }),
    ).toMatchObject({ atendimentoHoras: 8, solucaoHoras: 24, origem: 'peso' });
  });

  it('a categoria sobrepõe o que tem, liga a pausa e limita o atendimento à solução', () => {
    expect(regra(P.baixa, CATEGORIA)).toEqual({
      atendimentoHoras: 4,
      solucaoHoras: 4,
      relogio: '24x7',
      pausa: true,
      origem: 'chave_padrao',
      daCategoria: true,
    });
    expect(regra(P.baixa, '0193a000-0000-4000-8000-0000000000c2')).toMatchObject({
      solucaoHoras: 72,
      pausa: false,
      daCategoria: false,
    });
  });

  it('a pausa só para o relógio com a categoria ligada e o motivo da lista', () => {
    const lista = SLA_PADRAO.motivosQuePausam;
    expect(pausaParaORelogio({ pausa: true }, lista, 'aguardando_peca')).toBe(true);
    expect(pausaParaORelogio({ pausa: true }, lista, 'uh_ocupada_sem_acesso')).toBe(true);
    expect(pausaParaORelogio({ pausa: true }, lista, 'fim_de_turno')).toBe(false);
    expect(pausaParaORelogio({ pausa: true }, lista, null)).toBe(false);
    expect(pausaParaORelogio({ pausa: false }, lista, 'aguardando_peca')).toBe(false);
  });
});

describe('dias sem atendimento', () => {
  const oficiais = [
    { data: '2026-10-12', tipo: 'feriado' as const },
    { data: '2026-02-16', tipo: 'ponto_facultativo' as const },
    { data: '2026-06-12', tipo: 'observancia' as const },
  ];
  const doHotel = [
    { data: '2025-09-08', anual: true },
    { data: '2026-11-20', anual: false },
    { data: '2024-02-29', anual: true },
  ];

  it('feriado sempre; ponto facultativo só ligado; observância nunca; o anual em cada ano', () => {
    const desligado = datasSemAtendimento({
      oficiais,
      doHotel,
      pontoFacultativo: false,
      anos: [2026, 2027],
    });
    expect([...desligado].sort()).toEqual(['2026-09-08', '2026-10-12', '2026-11-20', '2027-09-08']);
    const ligado = datasSemAtendimento({ oficiais, doHotel, pontoFacultativo: true, anos: [2028] });
    expect(ligado.has('2026-02-16')).toBe(true);
    expect(ligado.has('2026-06-12')).toBe(false);
    // 29 de fevereiro anual só no ano bissexto.
    expect(ligado.has('2028-02-29')).toBe(true);
    expect(desligado.has('2027-03-01')).toBe(false);
  });
});

describe('cálculo do prazo', () => {
  it('24x7: horas corridas, sem olhar o calendário', () => {
    expect(calcularPrazo(em('2026-10-10T23:00:00Z'), 2, '24x7', cal(SP, ['2026-10-11']))).toEqual(
      em('2026-10-11T01:00:00Z'),
    );
  });

  it('atendimento: atravessa o fim de semana e pula o feriado (12/10)', () => {
    // Sexta 17h em São Paulo: 1 h na sexta, 4 no sábado, nada no domingo nem no feriado,
    // 10 na terça e 9 na quarta: quarta, 17h.
    const sexta17h = em('2026-10-09T20:00:00Z');
    expect(calcularPrazo(sexta17h, 24, 'atendimento', cal(SP, ['2026-10-12']))).toEqual(
      em('2026-10-14T20:00:00Z'),
    );
    expect(calcularPrazo(sexta17h, 24, 'atendimento', cal(SP))).toEqual(em('2026-10-13T20:00:00Z'));
  });

  it('aberto fora do horário: conta a partir da abertura seguinte', () => {
    // Domingo 10h: segunda 8h + 8 h = segunda, 16h.
    expect(calcularPrazo(em('2026-10-11T13:00:00Z'), 8, 'atendimento', cal(SP))).toEqual(
      em('2026-10-12T19:00:00Z'),
    );
  });

  it('o intervalo de almoço não conta, e o prazo no fim do intervalo fica nele', () => {
    const comAlmoco = cal(SP, [], {
      ...HORARIO_PADRAO,
      seg: [
        { inicio: '08:00', fim: '12:00' },
        { inicio: '13:00', fim: '18:00' },
      ],
    });
    // Segunda 11h + 3 h: 1 h até o almoço, 2 h depois dele: 15h.
    expect(calcularPrazo(em('2026-10-19T14:00:00Z'), 3, 'atendimento', comAlmoco)).toEqual(
      em('2026-10-19T18:00:00Z'),
    );
    // Segunda 10h + 8 h = 18h da mesma segunda, e não 8h da terça.
    expect(calcularPrazo(em('2026-10-19T13:00:00Z'), 8, 'atendimento', cal(SP))).toEqual(
      em('2026-10-19T21:00:00Z'),
    );
  });

  it('no fuso de cada hotel: Manaus e Fernando de Noronha', () => {
    expect(
      calcularPrazo(em('2026-10-19T14:00:00Z'), 8, 'atendimento', cal('America/Manaus')),
    ).toEqual(em('2026-10-19T22:00:00Z'));
    expect(
      calcularPrazo(em('2026-10-19T12:00:00Z'), 8, 'atendimento', cal('America/Noronha')),
    ).toEqual(em('2026-10-19T20:00:00Z'));
  });

  it('horário de verão: o dia do salto tem 23 h, pela base de fusos (São Paulo, 04/11/2018)', () => {
    const dia = cal(SP, [], TODO_DIA);
    // Sábado 23h (-03) + 2 h: 1 h no sábado, e o domingo começa à 1h (-02).
    expect(calcularPrazo(em('2018-11-04T02:00:00Z'), 2, 'atendimento', dia)).toEqual(
      em('2018-11-04T04:00:00Z'),
    );
    // O domingo inteiro tem 23 h de atendimento.
    expect(
      horasDeRelogioEntre(
        em('2018-11-04T03:00:00Z'),
        em('2018-11-05T02:00:00Z'),
        'atendimento',
        dia,
      ),
    ).toBe(23);
  });

  it('tempo de relógio entre dois instantes', () => {
    // Sexta 17h até terça 9h, com o feriado na segunda: 1 + 4 + 1 = 6 h.
    expect(
      horasDeRelogioEntre(
        em('2026-10-09T20:00:00Z'),
        em('2026-10-13T12:00:00Z'),
        'atendimento',
        cal(SP, ['2026-10-12']),
      ),
    ).toBe(6);
    expect(
      tempoDeRelogioEntre(em('2026-10-13T12:00:00Z'), em('2026-10-09T20:00:00Z'), '24x7', cal(SP)),
    ).toBe(0);
  });
});

describe('prazo na retomada da pausa que parou o relógio', () => {
  it('atendimento: o que faltava conta a partir da retomada; o parado vai ao lado', () => {
    // Prazo terça 17h; pausa terça 10h (faltavam 7 h); retomada quarta 9h: quarta 16h.
    const r = prazoNaRetomada({
      prazoSolucao: em('2026-10-13T20:00:00Z'),
      pausadaEm: em('2026-10-13T13:00:00Z'),
      retomadaEm: em('2026-10-14T12:00:00Z'),
      relogio: 'atendimento',
      calendario: cal(SP),
    });
    expect(r).toEqual({ prazoSolucao: em('2026-10-14T19:00:00Z'), pausadoMs: 9 * H });
  });

  it('24x7: o prazo anda o tempo da pausa', () => {
    expect(
      prazoNaRetomada({
        prazoSolucao: em('2026-10-13T20:00:00Z'),
        pausadaEm: em('2026-10-13T13:00:00Z'),
        retomadaEm: em('2026-10-13T15:00:00Z'),
        relogio: '24x7',
        calendario: cal(SP),
      }),
    ).toEqual({ prazoSolucao: em('2026-10-13T22:00:00Z'), pausadoMs: 2 * H });
  });

  it('a pausa com o prazo já vencido não muda nada', () => {
    const prazoSolucao = em('2026-10-13T20:00:00Z');
    expect(
      prazoNaRetomada({
        prazoSolucao,
        pausadaEm: em('2026-10-13T21:00:00Z'),
        retomadaEm: em('2026-10-14T12:00:00Z'),
        relogio: 'atendimento',
        calendario: cal(SP),
      }),
    ).toEqual({ prazoSolucao, pausadoMs: 0 });
  });
});
