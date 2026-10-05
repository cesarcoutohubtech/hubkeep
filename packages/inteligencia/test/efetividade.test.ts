// Efetividade antes e depois: a mesma janela dos dois lados da intervenção,
// paradas cortadas na data e o resultado sempre como variação observada.
import { describe, expect, it } from 'vitest';
import { efetividadeAntesDepois } from '../src';
import { agora, corretiva, dia, hora } from './apoio';

const t = dia(-100);
const corretivasEm = (dias: readonly number[], reaberturas = 0) =>
  dias.map((d) => corretiva({ abertaEm: dia(d, t), reaberturas }));

describe('efetividade da intervenção', () => {
  it('PRD 16: menos chamados, reaberturas, horas paradas e custo depois da troca', () => {
    const e = efetividadeAntesDepois(
      {
        intervencaoEm: t,
        corretivas: [
          ...corretivasEm([-80, -70], 1),
          ...corretivasEm([-60, -50, -40, -30, -20, -15, -10, -5]),
          ...corretivasEm([10, 40, 80]),
        ],
        paradas: [
          { inicio: dia(-50, t), fim: hora(20, dia(-50, t)) },
          { inicio: hora(-2, t), fim: hora(3, t) },
          { inicio: dia(20, t), fim: hora(4, dia(20, t)) },
        ],
        custos: [
          { em: dia(-30, t), valor: 9800 },
          { em: dia(30, t), valor: 1900 },
        ],
      },
      agora,
    );
    expect(e.resultado).toBe('reducao_observada');
    expect(e.metricas).toEqual([
      { chave: 'chamados', antes: 10, depois: 3, variacaoPercentual: -70 },
      { chave: 'reaberturas', antes: 2, depois: 0, variacaoPercentual: -100 },
      // A parada que atravessa a intervenção conta 2 h antes e 3 h depois.
      { chave: 'horas_paradas', antes: 22, depois: 7, variacaoPercentual: -68.2 },
      { chave: 'custo', antes: 9800, depois: 1900, variacaoPercentual: -80.6 },
    ]);
  });

  it('o depois ainda sem a janela inteira fica como incompleto', () => {
    const e = efetividadeAntesDepois(
      { intervencaoEm: dia(-30), corretivas: corretivasEm([-200]), paradas: [] },
      agora,
    );
    expect([e.resultado, e.diasDecorridos]).toEqual(['janela_incompleta', 30]);
  });

  it.each([
    [
      [-10, -20, -30, -40, -50, -60, -70, -80, -85, -88],
      [10, 20, 30, 40, 50, 60, 70, 80, 85],
      'sem_mudanca_relevante',
    ],
    [[-10, -20, -30, -40, -50], [10, 20, 30, 40, 50, 60, 70, 80], 'aumento_observado'],
    [[], [10], 'sem_base_de_comparacao'],
  ] as const)('antes %j, depois %j → %s', (antes, depois, resultado) => {
    const e = efetividadeAntesDepois(
      { intervencaoEm: t, corretivas: corretivasEm([...antes, ...depois]), paradas: [] },
      agora,
    );
    expect(e.resultado).toBe(resultado);
  });

  it('sem custo da instrumentação, a métrica de custo não aparece', () => {
    const e = efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, agora);
    expect(e.metricas.map((m) => m.chave)).toEqual(['chamados', 'reaberturas', 'horas_paradas']);
  });
});
