// O cálculo do job diário (ADR-036): scores por ativo, a linha da métrica e
// as detecções que vão para decidirDeteccao.
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoDia,
  type Corretiva,
  type HotelDoDia,
  type LocalAnalisado,
  PADRAO_ATENCAO,
  PADRAO_SISTEMICO,
  PADRAO_REINCIDENCIA,
  VERSAO_ATENCAO,
  VERSAO_REINCIDENCIA,
  calcularDia,
  fimDoDia,
  fimDoDiaNoFuso,
} from '../src';
import { agora, corretiva, dia, hora } from './apoio';

const hoteis: HotelDoDia[] = [
  { hotelId: 'h1', bandeiraId: 'b1' },
  { hotelId: 'h2', bandeiraId: 'b1' },
  { hotelId: 'h3', bandeiraId: 'b2' },
];

const ativo = (p: Partial<AtivoDoDia> & { id: string }): AtivoDoDia => ({
  hotelId: 'h1',
  categoriaId: null,
  fabricante: null,
  modelo: null,
  criticidade: null,
  paradas: [],
  ...p,
});

/** Seis corretivas em 30 dias, reabertas, com a mesma falha e impacto no hóspede. */
const problematico = (ativoId: string): Corretiva[] =>
  Array.from({ length: 6 }, (_, i) =>
    corretiva({
      ativoId,
      abertaEm: dia(-1 - i * 5),
      concluidaEm: dia(-i * 5),
      reaberturas: i < 3 ? 1 : 0,
      codigoFalha: 'compressor',
      impactoHospede: true,
    }),
  );

describe('calcularDia: scores e métrica do dia', () => {
  it('a preventiva atrasada sai das OS preventivas do ativo; sem nenhuma, fica sem dado (versão 5)', () => {
    // agora é 30/09/2026, 12:00 UTC; os hotéis do teste contam em UTC.
    const preventiva = (dataPrevista: string, concluidaEm?: Date) => ({
      dataPrevista,
      transicoes: concluidaEm ? [{ para: 'concluida' as const, quando: concluidaEm }] : [],
    });
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [
        ativo({ id: 'a1', preventivas: [preventiva('2026-09-29')] }),
        ativo({
          id: 'a2',
          preventivas: [preventiva('2026-09-29', dia(-1)), preventiva('2026-09-30')],
        }),
        // A conclusão depois de agora não conta: no dia, ela ainda estava atrasada.
        ativo({ id: 'a3', preventivas: [preventiva('2026-09-20', dia(2))] }),
        ativo({ id: 'a4' }),
        ativo({ id: 'a5', preventivas: [] }),
      ],
      corretivas: [],
      locais: [],
    });
    const componente = (id: string) =>
      r.ativos
        .find((a) => a.ativoId === id)
        ?.atencao.componentes.find((c) => c.chave === 'preventiva_atrasada')?.valor;
    expect(['a1', 'a2', 'a3', 'a4', 'a5'].map(componente)).toEqual([1, 0, 1, null, null]);
    expect(r.ativos.find((a) => a.ativoId === 'a4')?.atencao.ausentes).toContain(
      'preventiva_atrasada',
    );
  });

  it('a falha depois de preventiva sai das OS preventivas do ativo; sem nenhuma, fica sem dado (reincidência versão 4)', () => {
    const preventiva = {
      dataPrevista: '2026-09-17',
      transicoes: [{ para: 'concluida' as const, quando: dia(-12) }],
    };
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [ativo({ id: 'a1', preventivas: [preventiva] }), ativo({ id: 'a2' })],
      corretivas: ['a1', 'a2'].flatMap((ativoId) => [
        corretiva({ ativoId, abertaEm: dia(-50) }),
        corretiva({ ativoId, abertaEm: dia(-10) }),
      ]),
      locais: [],
    });
    const componente = (id: string) =>
      r.ativos
        .find((a) => a.ativoId === id)
        ?.reincidencia.componentes.find((c) => c.chave === 'apos_preventiva');
    // a1: a corretiva de −10 abre 2 dias depois da conclusão; a de −50, antes.
    expect(componente('a1')?.valor).toBe(0.5);
    expect(componente('a1')?.evidencia).toMatchObject({ quantidade: 1, comDado: 2 });
    expect(componente('a2')?.valor).toBeNull();
    expect(r.ativos.find((a) => a.ativoId === 'a2')?.reincidencia.ausentes).toContain(
      'apos_preventiva',
    );
  });

  it('ativo com histórico pesado passa do limite e gera a detecção de atenção no hotel', () => {
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [
        ativo({
          id: 'a1',
          criticidade: 5,
          paradas: [{ inicio: dia(-3), fim: null }],
        }),
        ativo({ id: 'a2' }),
      ],
      corretivas: [...problematico('a1'), corretiva({ ativoId: 'a2', abertaEm: dia(-40) })],
      locais: [],
    });

    expect(r.dia).toBe('2026-09-30');
    expect(r.ativos.map((a) => a.ativoId)).toEqual(['a1', 'a2']);
    const [a1] = r.ativos;
    expect(a1?.atencao.valor).toBeGreaterThanOrEqual(70);
    expect(r.metricas[0]).toEqual({
      dia: '2026-09-30',
      ativoId: 'a1',
      hotelId: 'h1',
      reincidencia: a1?.reincidencia.valor,
      atencao: a1?.atencao.valor,
      faixaAtencao: a1?.atencao.faixa,
      recalculo: false,
      versaoFormulaReincidencia: 4,
      versaoFormulaAtencao: 6,
      versaoPolitica: 'padrao',
      detalheReincidencia: a1?.reincidencia,
      detalheAtencao: a1?.atencao,
    });
    // O detalhamento leva a configuração usada (ADR-036).
    expect(r.metricas[0]?.detalheAtencao.configuracao).toEqual(PADRAO_ATENCAO);

    const atencao = r.deteccoes.filter((d) => d.tipo === 'atencao_ativo');
    expect(atencao).toHaveLength(1);
    expect(atencao[0]).toMatchObject({
      familia: 'atencao_ativo|ativoId=a1|hotelId=h1',
      faixa: a1?.atencao.faixa,
      alcance: { tipo: 'hotel', hotelId: 'h1', bandeiraId: 'b1' },
      valor: a1?.atencao.valor,
      versao: 6,
      escopo: { ativoId: 'a1', hotelId: 'h1' },
    });
    expect(atencao[0]?.corretivaIds).toHaveLength(6);
    expect(atencao[0]?.detalhe).toBe(a1?.atencao);
  });

  it('o ativo baixado sai do score e da métrica a partir da baixa', () => {
    const entrada = (desativadoEm: Date) => ({
      agora,
      hoteis,
      ativos: [ativo({ id: 'a1', criticidade: 5, desativadoEm }), ativo({ id: 'a2' })],
      corretivas: problematico('a1'),
      locais: [],
    });
    const baixado = calcularDia(entrada(dia(-1)));
    expect(baixado.metricas.map((m) => m.ativoId)).toEqual(['a2']);
    expect(baixado.deteccoes).toEqual([]);
    // Recalculado um dia antes da baixa, o ativo ainda conta.
    const antes = calcularDia({ ...entrada(dia(1)), agora });
    expect(antes.metricas.map((m) => m.ativoId)).toEqual(['a1', 'a2']);
  });

  it('a2, com uma corretiva, tem métrica e nenhuma detecção', () => {
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [ativo({ id: 'a2' })],
      corretivas: [corretiva({ ativoId: 'a2', abertaEm: dia(-40) })],
      locais: [],
    });
    expect(r.metricas).toHaveLength(1);
    expect(r.deteccoes).toEqual([]);
  });

  it('usa a política resolvida do hotel: janela de 30 dias deixa a corretiva de 40 dias de fora', () => {
    const curta = { ...PADRAO_REINCIDENCIA, janelaDias: 30 };
    const r = calcularDia({
      agora,
      hoteis: [{ hotelId: 'h2', bandeiraId: 'b1', reincidencia: curta }],
      ativos: [ativo({ id: 'a9', hotelId: 'h2' })],
      corretivas: [
        corretiva({ hotelId: 'h2', ativoId: 'a9', abertaEm: dia(-40) }),
        corretiva({ hotelId: 'h2', ativoId: 'a9', abertaEm: dia(-10) }),
      ],
      locais: [],
    });
    const [a9] = r.ativos;
    expect(a9?.reincidencia.configuracao.janelaDias).toBe(30);
    expect(
      a9?.reincidencia.componentes.find((c) => c.chave === 'corretivas')?.evidencia,
    ).toMatchObject({ quantidade: 1, janelaDias: 30 });
  });

  it('horas paradas: só o trecho dentro da janela, e a parada aberta conta até agora', () => {
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [
        ativo({
          id: 'a1',
          paradas: [
            { inicio: dia(-100), fim: dia(-95) },
            { inicio: dia(-91), fim: dia(-89) },
            { inicio: hora(-2), fim: null },
          ],
        }),
      ],
      corretivas: [],
      locais: [],
    });
    const parada = r.ativos[0]?.atencao.componentes.find((c) => c.chave === 'parada');
    expect(parada?.evidencia).toMatchObject({ horas: 26 });
  });

  it('a garantia e as medições entram na atenção; sem a data, não vencida; medição só na categoria com item', () => {
    const r = calcularDia({
      agora,
      hoteis: [{ hotelId: 'h1', bandeiraId: 'b1' }],
      ativos: [
        ativo({
          id: 'a1',
          categoriaId: 'ar',
          garantiaAte: dia(-10),
          medicoes: { foraDaFaixa: 1, total: 4 },
        }),
        ativo({ id: 'a2', categoriaId: 'ar', garantiaAte: dia(30) }),
        ativo({ id: 'a3', categoriaId: 'tv', medicoes: { foraDaFaixa: 4, total: 4 } }),
      ],
      corretivas: [],
      locais: [],
      categoriasComMedicao: ['ar'],
    });
    const comp = (id: string, chave: string) =>
      r.ativos.find((a) => a.ativoId === id)?.atencao.componentes.find((c) => c.chave === chave);
    expect(comp('a1', 'garantia_vencida')).toMatchObject({
      valor: 1,
      evidencia: { vencida: true, diasVencida: 10 },
    });
    expect(comp('a1', 'medicoes_fora_da_faixa')).toMatchObject({ valor: 0.25 });
    expect(comp('a2', 'garantia_vencida')).toMatchObject({ valor: 0 });
    // Categoria com item de medição e nenhuma medição: abaixo do mínimo, conta 0.
    expect(comp('a2', 'medicoes_fora_da_faixa')).toMatchObject({
      valor: 0,
      evidencia: { total: 0, abaixoDoMinimo: true },
    });
    expect(comp('a3', 'garantia_vencida')).toMatchObject({
      valor: 0,
      evidencia: { semData: true },
    });
    // Categoria sem item de medição: sem dado, mesmo com medições na entrada.
    expect(comp('a3', 'medicoes_fora_da_faixa')?.valor).toBeNull();
  });

  it('sem categoriasComMedicao (antes da PV1), as medições ficam sem dado em todos', () => {
    const r = calcularDia({
      agora,
      hoteis: [{ hotelId: 'h1', bandeiraId: 'b1' }],
      ativos: [ativo({ id: 'a1', categoriaId: 'ar', medicoes: { foraDaFaixa: 1, total: 4 } })],
      corretivas: [],
      locais: [],
    });
    expect(r.ativos[0]?.atencao.ausentes).toContain('medicoes_fora_da_faixa');
  });

  it('o custo vale pela metade das corretivas aceitas do tenant, inclusive de hotel fora do cálculo', () => {
    const com = (ativoId: string, hotelId: string, custoInformado: number | null) =>
      corretiva({
        ativoId,
        hotelId,
        abertaEm: dia(-30),
        concluidaEm: dia(-29),
        aceitaEm: dia(-28),
        custoInformado,
      });
    const entrada = (corretivas: Corretiva[]) =>
      calcularDia({
        agora,
        hoteis: [{ hotelId: 'h1', bandeiraId: 'b1' }],
        ativos: [ativo({ id: 'a1' }), ativo({ id: 'a2' })],
        corretivas,
        locais: [],
      });
    const custo = (r: ReturnType<typeof calcularDia>, id: string) =>
      r.ativos.find((a) => a.ativoId === id)?.atencao.componentes.find((c) => c.chave === 'custo');

    // 2 de 4 aceitas do tenant com custo (uma de outro hotel): disponível.
    const sim = entrada([
      com('a1', 'h1', 2000),
      com('a1', 'h1', null),
      com('a2', 'h1', null),
      com('z1', 'outro', 500),
    ]);
    expect(custo(sim, 'a1')).toMatchObject({
      valor: 0.2,
      evidencia: { valor12m: 2000, informadas: 1, aceitas: 2, disponivelNoTenant: true },
    });
    // O ativo sem nenhum custo informado soma 0, e não fica sem dado.
    expect(custo(sim, 'a2')).toMatchObject({ valor: 0, evidencia: { informadas: 0 } });

    // 1 de 3: abaixo da metade, sem dado em todos os ativos.
    const nao = entrada([com('a1', 'h1', 2000), com('a1', 'h1', null), com('a2', 'h1', null)]);
    expect(custo(nao, 'a1')).toMatchObject({
      valor: null,
      evidencia: { valor12m: null, disponivelNoTenant: false, percentualNoTenant: 33.3 },
    });
    expect(custo(nao, 'a2')?.valor).toBeNull();
  });

  it('ativo, corretiva e local de hotel fora da lista não entram', () => {
    const r = calcularDia({
      agora,
      hoteis: [{ hotelId: 'h1', bandeiraId: 'b1' }],
      ativos: [ativo({ id: 'a1' }), ativo({ id: 'z1', hotelId: 'outro' })],
      corretivas: [
        ...problematico('z1').map((c) => ({ ...c, hotelId: 'outro' })),
        corretiva({ ativoId: 'a1', abertaEm: dia(-5) }),
      ],
      locais: [],
    });
    expect(r.ativos.map((a) => a.ativoId)).toEqual(['a1']);
    expect(r.deteccoes).toEqual([]);
  });
});

describe('calcularDia: detecções sistêmicas', () => {
  const uhs = (n: number, hotelId: string): LocalAnalisado[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${hotelId}-uh${i}`, hotelId, andar: '3' }));
  const doModelo = (ids: readonly [string, string][]): AtivoDoDia[] =>
    ids.map(([id, hotelId]) =>
      ativo({ id, hotelId, categoriaId: 'hvac', fabricante: 'Acme', modelo: 'X1' }),
    );
  // Outro modelo na categoria, sem chamado: sem ele não há com o que comparar,
  // e o mesmo modelo não dispara (respostas de 10/10/2026).
  // Mais quatro do modelo, sem chamado: a população do modelo chega aos 10 do mínimo (v4).
  const base = [
    ativo({ id: 'o1', hotelId: 'h1', categoriaId: 'hvac', fabricante: 'Trane', modelo: 'T9' }),
    ...doModelo([
      ['s1', 'h1'],
      ['s2', 'h1'],
      ['s3', 'h1'],
      ['s4', 'h1'],
    ]),
  ];
  const falhas = (as: readonly AtivoDoDia[]): Corretiva[] =>
    as.map((a, i) =>
      corretiva({ hotelId: a.hotelId, ativoId: a.id, codigoFalha: 'ruido', abertaEm: dia(-i * 7) }),
    );
  // Só o mesmo modelo vem ligado: o mesmo andar precisa ser ligado pela política.
  const comAndar = {
    ...PADRAO_SISTEMICO,
    mesmoAndar: { ...PADRAO_SISTEMICO.mesmoAndar, ativa: true },
  };

  it('mesmo andar de um hotel: insight do hotel, com faixa fixa e sem score', () => {
    const locais = uhs(8, 'h1');
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [],
      corretivas: locais.map((l, i) =>
        corretiva({ localId: l.id, ativoId: null, codigoFalha: 'agua_fria', abertaEm: dia(-i) }),
      ),
      locais,
      sistemico: comAndar,
    });
    const andar = r.deteccoes.filter((d) => d.regra === 'mesmo_andar');
    expect(andar).toHaveLength(1);
    expect(andar[0]).toMatchObject({
      tipo: 'sistemico',
      familia: 'sistemico|andar=3|falha=agua_fria|hotelId=h1|regra=mesmo_andar',
      faixa: 'atencao',
      alcance: { tipo: 'hotel', hotelId: 'h1', bandeiraId: 'b1' },
      valor: null,
    });
    expect(andar[0]?.corretivaIds).toHaveLength(8);
  });

  it('mesmo modelo em hotéis da mesma bandeira: insight de rede da bandeira', () => {
    // Três hotéis da bandeira b1 (os mínimos do mesmo modelo: 3 hotéis, 6 chamados, 5 ativos).
    const daBandeira = [...hoteis, { hotelId: 'h4', bandeiraId: 'b1' }];
    const as = doModelo([
      ['m1', 'h1'],
      ['m2', 'h1'],
      ['m3', 'h2'],
      ['m4', 'h2'],
      ['m5', 'h4'],
      ['m6', 'h4'],
    ]);
    const r = calcularDia({
      agora,
      hoteis: daBandeira,
      ativos: [...as, ...base],
      corretivas: falhas(as),
      locais: [],
    });
    const modelo = r.deteccoes.find((d) => d.regra === 'mesmo_modelo');
    expect(modelo?.alcance).toEqual({ tipo: 'rede', bandeiraId: 'b1' });
    expect(modelo?.hotelIds).toEqual(['h1', 'h2', 'h4']);
    expect(modelo?.escopo).toEqual({
      regra: 'mesmo_modelo',
      categoriaId: 'hvac',
      modelo: 'acme|x1',
    });
  });

  it('mesmo modelo em bandeiras diferentes: insight de rede do grupo', () => {
    const as = doModelo([
      ['m1', 'h1'],
      ['m2', 'h1'],
      ['m3', 'h2'],
      ['m4', 'h3'],
      ['m5', 'h3'],
      ['m6', 'h3'],
    ]);
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [...as, ...base],
      corretivas: falhas(as),
      locais: [],
    });
    const modelo = r.deteccoes.find((d) => d.regra === 'mesmo_modelo');
    expect(modelo?.alcance).toEqual({ tipo: 'rede', bandeiraId: null });
    expect(modelo?.hotelIds).toEqual(['h1', 'h2', 'h3']);
  });

  it('o escopo e a evidência só citam hotéis da lista hotelIds (a RLS lê por ela)', () => {
    const as = doModelo([
      ['m1', 'h1'],
      ['m2', 'h2'],
      ['m3', 'h2'],
      ['m4', 'h2'],
      ['m5', 'h3'],
      ['m6', 'h3'],
    ]);
    const locais = uhs(8, 'h3');
    const doA1 = problematico('a1');
    const doModelo5 = falhas(as);
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [ativo({ id: 'a1', criticidade: 5 }), ...as, ...base],
      corretivas: [
        ...doA1,
        ...doModelo5,
        ...locais.map((l, i) =>
          corretiva({
            hotelId: 'h3',
            localId: l.id,
            ativoId: null,
            codigoFalha: 'agua_fria',
            abertaEm: dia(-i),
          }),
        ),
      ],
      locais,
      sistemico: comAndar,
    });
    const hotelDa = new Map([...doA1, ...doModelo5].map((c) => [c.id, c.hotelId] as const));
    expect(new Set(r.deteccoes.map((d) => d.tipo))).toEqual(
      new Set(['atencao_ativo', 'sistemico']),
    );
    for (const d of r.deteccoes) {
      expect(d.hotelIds.length).toBeGreaterThan(0);
      if (d.alcance.tipo === 'hotel') expect(d.hotelIds).toEqual([d.alcance.hotelId]);
      if (d.escopo.hotelId) expect(d.hotelIds).toContain(d.escopo.hotelId);
      for (const id of d.corretivaIds) {
        const h = hotelDa.get(id);
        if (h) expect(d.hotelIds).toContain(h);
      }
    }
  });
});

describe('calcularDia: o limite do insight vem da política de atenção do hotel', () => {
  it('com o limite em 100, o mesmo ativo não gera detecção', () => {
    const entrada = (limiteInsight: number) =>
      calcularDia({
        agora,
        hoteis: [
          { hotelId: 'h1', bandeiraId: 'b1', atencao: { ...PADRAO_ATENCAO, limiteInsight } },
        ],
        ativos: [ativo({ id: 'a1', criticidade: 5, paradas: [{ inicio: dia(-3), fim: null }] })],
        corretivas: problematico('a1'),
        locais: [],
      });
    const tipos = (limite: number) =>
      entrada(limite).deteccoes.filter((d) => d.tipo === 'atencao_ativo');
    expect(tipos(70)).toHaveLength(1);
    expect(tipos(100)).toEqual([]);
    expect(entrada(100).ativos[0]?.atencao.configuracao.limiteInsight).toBe(100);
  });
});

describe('calcularDia: versões e recálculo no resultado do dia (ADR-036, condição do Cesar)', () => {
  const entrada = (extra: Partial<Parameters<typeof calcularDia>[0]> = {}) => ({
    agora,
    hoteis: [
      {
        hotelId: 'h1',
        bandeiraId: 'b1',
        versaoPolitica: 'hotel:p1@2026-09-01;grupo:p2@2026-08-01',
      },
      { hotelId: 'h2', bandeiraId: 'b1' },
    ],
    ativos: [ativo({ id: 'a1' }), ativo({ id: 'a2', hotelId: 'h2' })],
    corretivas: [corretiva({ ativoId: 'a1', abertaEm: dia(-5) })],
    locais: [],
    ...extra,
  });

  it('cada linha leva a versão da fórmula de cada score e a da política do hotel', () => {
    const r = calcularDia(entrada());
    expect(r.recalculo).toBe(false);
    expect(r.metricas.map((m) => [m.ativoId, m.versaoPolitica])).toEqual([
      ['a1', 'hotel:p1@2026-09-01;grupo:p2@2026-08-01'],
      ['a2', 'padrao'],
    ]);
    for (const m of r.metricas) {
      expect(m.recalculo).toBe(false);
      expect(m.versaoFormulaReincidencia).toBe(VERSAO_REINCIDENCIA);
      expect(m.versaoFormulaAtencao).toBe(VERSAO_ATENCAO);
    }
  });

  it('o recálculo marca todas as linhas, e o resultado também', () => {
    const r = calcularDia(entrada({ recalculo: true, agora: fimDoDia('2026-09-20') }));
    expect(r.dia).toBe('2026-09-20');
    expect(r.recalculo).toBe(true);
    expect(r.metricas.every((m) => m.recalculo && m.dia === '2026-09-20')).toBe(true);
  });

  it('fimDoDia: o último instante do dia em UTC, e dia inválido é recusado', () => {
    expect(fimDoDia('2026-09-30').toISOString()).toBe('2026-09-30T23:59:59.999Z');
    for (const ruim of ['2026-9-30', '2026-02-30', 'ontem']) expect(() => fimDoDia(ruim)).toThrow();
  });
});

describe('calcularDia: o dia no fuso de cada hotel (glossário, divergência a)', () => {
  // 02:30 UTC de 01/10 ainda é 30/09 em São Paulo (UTC-3) e em Manaus (UTC-4),
  // e já é 01/10 em Lisboa (UTC+1).
  const instante = new Date('2026-10-01T02:30:00.000Z');
  const entrada = (fusoDoH2: string) => ({
    agora: instante,
    hoteis: [
      { hotelId: 'h1', bandeiraId: 'b1', fuso: 'America/Sao_Paulo' },
      { hotelId: 'h2', bandeiraId: 'b1', fuso: fusoDoH2 },
    ],
    ativos: [ativo({ id: 'a1' }), ativo({ id: 'a2', hotelId: 'h2' })],
    corretivas: [],
    locais: [],
  });

  it('cada linha leva a data local do hotel dela', () => {
    const r = calcularDia(entrada('Europe/Lisbon'));
    expect(r.metricas.map((m) => [m.ativoId, m.dia])).toEqual([
      ['a1', '2026-09-30'],
      ['a2', '2026-10-01'],
    ]);
    // O dia da rodada é o menor dos dias locais.
    expect(r.dia).toBe('2026-09-30');
  });

  it('no Brasil, às 06:00 UTC do cron, o dia local é o mesmo do calendário em todos os fusos', () => {
    const cron = new Date('2026-10-01T06:00:00.000Z');
    const r = calcularDia({ ...entrada('America/Rio_Branco'), agora: cron });
    expect(r.metricas.map((m) => m.dia)).toEqual(['2026-10-01', '2026-10-01']);
    expect(r.dia).toBe('2026-10-01');
  });

  it('fimDoDiaNoFuso: o último instante do dia local, e dia inválido é recusado', () => {
    expect(fimDoDiaNoFuso('2026-09-30', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-01T02:59:59.999Z',
    );
    expect(fimDoDiaNoFuso('2026-09-30', 'America/Manaus').toISOString()).toBe(
      '2026-10-01T03:59:59.999Z',
    );
    expect(fimDoDiaNoFuso('2026-09-30', 'UTC')).toEqual(fimDoDia('2026-09-30'));
    // No dia em que Lisboa sai do horário de verão (25/10/2026), o dia tem 25 horas.
    expect(fimDoDiaNoFuso('2026-10-25', 'Europe/Lisbon').toISOString()).toBe(
      '2026-10-25T23:59:59.999Z',
    );
    expect(() => fimDoDiaNoFuso('2026-02-30', 'America/Sao_Paulo')).toThrow();
  });
});
