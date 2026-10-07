// O cálculo do job diário (ADR-036): scores por ativo, a linha da métrica e
// as detecções que vão para decidirDeteccao.
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoDia,
  type Corretiva,
  type HotelDoDia,
  type LocalAnalisado,
  PADRAO_ATENCAO,
  PADRAO_REINCIDENCIA,
  VERSAO_ATENCAO,
  VERSAO_REINCIDENCIA,
  calcularDia,
  fimDoDia,
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
      versaoFormulaReincidencia: 1,
      versaoFormulaAtencao: 1,
      versaoPolitica: 'padrao',
    });

    const atencao = r.deteccoes.filter((d) => d.tipo === 'atencao_ativo');
    expect(atencao).toHaveLength(1);
    expect(atencao[0]).toMatchObject({
      familia: 'atencao_ativo|ativoId=a1|hotelId=h1',
      faixa: a1?.atencao.faixa,
      alcance: { tipo: 'hotel', hotelId: 'h1', bandeiraId: 'b1' },
      valor: a1?.atencao.valor,
      versao: 1,
      escopo: { ativoId: 'a1', hotelId: 'h1' },
    });
    expect(atencao[0]?.corretivaIds).toHaveLength(6);
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
    ids.map(([id, hotelId]) => ativo({ id, hotelId, fabricante: 'Acme', modelo: 'X1' }));
  const falhas = (as: readonly AtivoDoDia[]): Corretiva[] =>
    as.map((a, i) =>
      corretiva({ hotelId: a.hotelId, ativoId: a.id, codigoFalha: 'ruido', abertaEm: dia(-i * 7) }),
    );

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
    const as = doModelo([
      ['m1', 'h1'],
      ['m2', 'h1'],
      ['m3', 'h2'],
      ['m4', 'h2'],
      ['m5', 'h2'],
    ]);
    const r = calcularDia({ agora, hoteis, ativos: as, corretivas: falhas(as), locais: [] });
    const modelo = r.deteccoes.find((d) => d.regra === 'mesmo_modelo');
    expect(modelo?.alcance).toEqual({ tipo: 'rede', bandeiraId: 'b1' });
  });

  it('mesmo modelo em bandeiras diferentes: insight de rede do grupo', () => {
    const as = doModelo([
      ['m1', 'h1'],
      ['m2', 'h1'],
      ['m3', 'h2'],
      ['m4', 'h3'],
      ['m5', 'h3'],
    ]);
    const r = calcularDia({ agora, hoteis, ativos: as, corretivas: falhas(as), locais: [] });
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
      ['m5', 'h2'],
    ]);
    const locais = uhs(8, 'h3');
    const doA1 = problematico('a1');
    const doModelo5 = falhas(as);
    const r = calcularDia({
      agora,
      hoteis,
      ativos: [ativo({ id: 'a1', criticidade: 5 }), ...as],
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
