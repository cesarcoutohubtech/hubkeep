import { describe, expect, it } from 'vitest';
import {
  agregarMesDosAtivos,
  agregarMesDosHoteis,
  JANELA_DE_LEITURA_PADRAO_DIAS,
  inicioDaJanelaDeLeitura,
  mesAFechar,
  type MetricaDiaria,
} from '../src';

const m = (p: Partial<MetricaDiaria> & { dia: string }): MetricaDiaria => ({
  ativoId: 'a1',
  hotelId: 'h1',
  reincidencia: null,
  atencao: null,
  faixaAtencao: 'dados_insuficientes',
  ...p,
});

describe('agregação mensal por ativo', () => {
  const dias = [
    m({ dia: '2026-09-01', reincidencia: 40, atencao: 60, faixaAtencao: 'atencao' }),
    m({ dia: '2026-09-02', reincidencia: 50, atencao: 75, faixaAtencao: 'alta_atencao' }),
    m({ dia: '2026-09-03', reincidencia: null, atencao: null }),
    m({ dia: '2026-09-04', reincidencia: 61, atencao: 72, faixaAtencao: 'alta_atencao' }),
    m({ dia: '2026-08-31', reincidencia: 99, atencao: 99, faixaAtencao: 'critico' }),
    m({ dia: '2026-09-02', ativoId: 'a2', atencao: 20, faixaAtencao: 'normal' }),
  ];

  it('média e máximo sem os dias sem dado, que contam à parte', () => {
    const [a1] = agregarMesDosAtivos(dias, '2026-09');
    // (60 + 75 + 72) / 3 = 69; (40 + 50 + 61) / 3 = 50,333... → 50,3
    expect(a1?.atencao).toEqual({ media: 69, maximo: 75, diasComDado: 3, diasSemDado: 1 });
    expect(a1?.reincidencia).toEqual({ media: 50.3, maximo: 61, diasComDado: 3, diasSemDado: 1 });
  });

  it('só os dias do mês pedido, faixas contadas e a faixa final é a do último dia', () => {
    const [a1, a2] = agregarMesDosAtivos(dias, '2026-09');
    expect(a1?.diasPorFaixa).toEqual({ atencao: 1, alta_atencao: 2, dados_insuficientes: 1 });
    expect(a1?.faixaFinal).toBe('alta_atencao');
    expect(a2).toMatchObject({ ativoId: 'a2', faixaFinal: 'normal' });
  });

  it('dia repetido vale o último da lista (o job regravou o dia)', () => {
    const [a1] = agregarMesDosAtivos(
      [m({ dia: '2026-09-01', atencao: 10 }), m({ dia: '2026-09-01', atencao: 30 })],
      '2026-09',
    );
    expect(a1?.atencao).toMatchObject({ media: 30, diasComDado: 1 });
  });

  it('ativo sem nenhum dado no mês fica com média nula, não zero', () => {
    const [a1] = agregarMesDosAtivos([m({ dia: '2026-09-01' })], '2026-09');
    expect(a1?.atencao).toEqual({ media: null, maximo: null, diasComDado: 0, diasSemDado: 1 });
  });

  it('dia fora do formato é erro de programação', () => {
    expect(() => agregarMesDosAtivos([m({ dia: '01/09/2026' })], '2026-09')).toThrow();
  });
});

describe('agregação mensal por hotel', () => {
  it('média das médias dos ativos com dado e ativos por faixa final', () => {
    const ativos = agregarMesDosAtivos(
      [
        m({ dia: '2026-09-01', ativoId: 'a1', atencao: 80, faixaAtencao: 'alta_atencao' }),
        m({ dia: '2026-09-01', ativoId: 'a2', atencao: 40, faixaAtencao: 'observar' }),
        m({ dia: '2026-09-01', ativoId: 'a3' }),
        m({ dia: '2026-09-01', ativoId: 'a4', hotelId: 'h2', atencao: 10, faixaAtencao: 'normal' }),
      ],
      '2026-09',
    );
    expect(agregarMesDosHoteis(ativos)).toEqual([
      {
        mes: '2026-09',
        hotelId: 'h1',
        ativos: 3,
        atencaoMedia: 60,
        ativosPorFaixaFinal: { alta_atencao: 1, observar: 1, dados_insuficientes: 1 },
      },
      {
        mes: '2026-09',
        hotelId: 'h2',
        ativos: 1,
        atencaoMedia: 10,
        ativosPorFaixaFinal: { normal: 1 },
      },
    ]);
  });
});

describe('janela de leitura e fechamento', () => {
  it('180 dias terminando hoje, contando hoje', () => {
    expect(JANELA_DE_LEITURA_PADRAO_DIAS).toBe(180);
    expect(inicioDaJanelaDeLeitura(new Date('2026-09-30T12:00:00Z'))).toBe('2026-04-04');
    expect(inicioDaJanelaDeLeitura(new Date('2026-09-30T23:59:59Z'), 1)).toBe('2026-09-30');
  });

  it('atravessa o fim do mês e do ano, e usa o valor da política no lugar do padrão', () => {
    expect(inicioDaJanelaDeLeitura(new Date('2027-01-10T00:00:00Z'), 11)).toBe('2026-12-31');
    expect(inicioDaJanelaDeLeitura(new Date('2027-01-10T00:00:00Z'))).toBe('2026-07-15');
    expect(inicioDaJanelaDeLeitura(new Date('2027-01-10T00:00:00Z'), 365)).toBe('2026-01-11');
  });
  it('o job fecha o mês anterior, inclusive na virada do ano', () => {
    expect(mesAFechar(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09');
    expect(mesAFechar(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12');
  });
});

describe('agregação mensal com recálculo (ADR-036)', () => {
  it('o dia recalculado vale pelo cálculo de maior número, em qualquer ordem', () => {
    const original = m({ dia: '2026-09-10', atencao: 40, faixaAtencao: 'observar', calculo: 1 });
    const recalculado = m({
      dia: '2026-09-10',
      atencao: 80,
      faixaAtencao: 'alta_atencao',
      calculo: 2,
    });
    for (const dias of [
      [original, recalculado],
      [recalculado, original],
    ]) {
      const [a1] = agregarMesDosAtivos(dias, '2026-09');
      expect(a1?.atencao).toEqual({ media: 80, maximo: 80, diasComDado: 1, diasSemDado: 0 });
      expect(a1?.faixaFinal).toBe('alta_atencao');
    }
  });

  it('sem o campo, vale 1; empate fica com o último da lista', () => {
    const a = m({ dia: '2026-09-10', atencao: 40, faixaAtencao: 'observar' });
    const b = m({ dia: '2026-09-10', atencao: 50, faixaAtencao: 'atencao', calculo: 1 });
    expect(agregarMesDosAtivos([a, b], '2026-09')[0]?.atencao.media).toBe(50);
    expect(agregarMesDosAtivos([b, a], '2026-09')[0]?.atencao.media).toBe(40);
  });
});
