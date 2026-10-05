// Forma comum dos scores: peso dos ausentes dividido entre os presentes,
// faixas pelo limite inferior e dados insuficientes sem nenhum componente.
import { describe, expect, it } from 'vitest';
import { FAIXAS_PADRAO, combinar, faixaDe, sugereInsight } from '../src';

describe('combinar', () => {
  it('divide o peso do componente ausente entre os presentes, na proporção', () => {
    const s = combinar(
      'x',
      1,
      [
        { chave: 'a', peso: 0.5, valor: 1, evidencia: {} },
        { chave: 'b', peso: 0.25, valor: 0, evidencia: {} },
        { chave: 'c', peso: 0.25, valor: null, evidencia: {} },
      ],
      FAIXAS_PADRAO,
      {},
    );
    expect(s.componentes.map((c) => [c.chave, c.pesoEfetivo])).toEqual([
      ['a', 2 / 3],
      ['b', 1 / 3],
      ['c', 0],
    ]);
    expect(s.valor).toBe(67);
    expect(s.faixa).toBe('atencao');
    expect(s.ausentes).toEqual(['c']);
  });

  it('sem nenhum dado, o valor é null e a faixa é dados_insuficientes', () => {
    const s = combinar(
      'x',
      1,
      [{ chave: 'a', peso: 1, valor: null, evidencia: {} }],
      FAIXAS_PADRAO,
      {},
    );
    expect([s.valor, s.faixa]).toEqual([null, 'dados_insuficientes']);
    expect(sugereInsight(s)).toBe(false);
  });

  it('limita o valor do componente a [0, 1]', () => {
    const s = combinar(
      'x',
      1,
      [{ chave: 'a', peso: 1, valor: 3, evidencia: {} }],
      FAIXAS_PADRAO,
      {},
    );
    expect(s.valor).toBe(100);
  });
});

describe('faixas do PRD', () => {
  it.each([
    [0, 'normal'],
    [29, 'normal'],
    [30, 'observar'],
    [49, 'observar'],
    [50, 'atencao'],
    [70, 'alta_atencao'],
    [84, 'alta_atencao'],
    [85, 'critico'],
    [100, 'critico'],
  ])('%i → %s', (v, faixa) => expect(faixaDe(v, FAIXAS_PADRAO)).toBe(faixa));
});
