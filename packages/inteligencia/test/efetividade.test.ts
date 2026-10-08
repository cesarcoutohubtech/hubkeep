// Efetividade antes e depois: a mesma janela dos dois lados da intervenção,
// paradas cortadas na data e o resultado sempre como variação observada.
import { CATALOGOS, IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import { PADRAO_EFETIVIDADE, VERSAO_EFETIVIDADE, efetividadeAntesDepois } from '../src';
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

  it('a versão 2 e os limiares padrão são os aprovados em 08/10/2026', () => {
    expect(VERSAO_EFETIVIDADE).toBe(2);
    expect(PADRAO_EFETIVIDADE).toEqual({
      janelaDias: 90,
      reducaoObservadaPercentual: 60,
      reducaoParcialPercentual: 25,
      aumentoObservadoPercentual: 20,
      minChamadosAntes: 3,
    });
    const e = efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, agora);
    expect(e.versao).toBe(2);
  });

  // Dez chamados antes (nos 90 dias antes da intervenção) e `depois` chamados depois.
  const dez = [-5, -15, -25, -35, -45, -55, -65, -75, -80, -85];
  const apos = (n: number) => Array.from({ length: n }, (_, i) => 1 + i * 5);
  const resultadoCom = (antes: readonly number[], depois: number) =>
    efetividadeAntesDepois(
      { intervencaoEm: t, corretivas: corretivasEm([...antes, ...apos(depois)]), paradas: [] },
      agora,
    );

  it.each([
    // [chamados depois, variação, resultado]
    [0, -100, 'reducao_observada'],
    [4, -60, 'reducao_observada'], // 60%: o limiar inclui
    [5, -50, 'reducao_parcial'],
    [7, -30, 'reducao_parcial'],
    [8, -20, 'sem_mudanca_relevante'],
    [10, 0, 'sem_mudanca_relevante'],
    [11, 10, 'sem_mudanca_relevante'],
    [12, 20, 'aumento_observado'], // +20%: o limiar inclui
    [15, 50, 'aumento_observado'],
  ] as const)('dez chamados antes, %i depois, variação %i → %s', (depois, variacao, resultado) => {
    const e = resultadoCom(dez, depois);
    expect(e.metricas[0]?.variacaoPercentual).toBe(variacao);
    expect(e.resultado).toBe(resultado);
  });

  it('no limiar de 25% de redução a parcial começa; um chamado a mais, não', () => {
    const quatro = [-5, -30, -60, -85];
    // 4 antes e 3 depois: -25%, parcial. 4 antes e 4 depois: 0%.
    expect(resultadoCom(quatro, 3).resultado).toBe('reducao_parcial');
    expect(resultadoCom(quatro, 4).resultado).toBe('sem_mudanca_relevante');
    // 8 antes e 7 depois: -12,5%; 4 antes e 5 depois: +25%.
    expect(resultadoCom([-5, -15, -25, -35, -45, -55, -65, -85], 7).resultado).toBe(
      'sem_mudanca_relevante',
    );
    expect(resultadoCom(quatro, 5).resultado).toBe('aumento_observado');
  });

  it('menos de 3 chamados antes: sem base de comparação, mesmo com queda de 100%', () => {
    expect(resultadoCom([-5, -30], 0).resultado).toBe('sem_base_de_comparacao');
    expect(resultadoCom([-5, -30, -60], 0).resultado).toBe('reducao_observada');
    expect(resultadoCom([], 5).resultado).toBe('sem_base_de_comparacao');
  });

  it('menos de 90 dias depois: janela incompleta, antes de qualquer outro resultado', () => {
    const corretivas = corretivasEm(dez);
    const em = (decorridos: number) =>
      efetividadeAntesDepois({ intervencaoEm: t, corretivas, paradas: [] }, dia(decorridos, t))
        .resultado;
    expect(em(89)).toBe('janela_incompleta');
    expect(em(90)).toBe('reducao_observada');
    // Sem base e janela incompleta: a janela vale primeiro.
    expect(
      efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, dia(10, t))
        .resultado,
    ).toBe('janela_incompleta');
  });

  it('os limiares vêm da configuração', () => {
    const e = efetividadeAntesDepois(
      { intervencaoEm: t, corretivas: corretivasEm([...dez, ...apos(8)]), paradas: [] },
      agora,
      {
        ...PADRAO_EFETIVIDADE,
        reducaoParcialPercentual: 10,
        aumentoObservadoPercentual: 30,
        minChamadosAntes: 11,
      },
    );
    expect(e.resultado).toBe('sem_base_de_comparacao');
    const f = efetividadeAntesDepois(
      { intervencaoEm: t, corretivas: corretivasEm([...dez, ...apos(9)]), paradas: [] },
      agora,
      { ...PADRAO_EFETIVIDADE, reducaoParcialPercentual: 10 },
    );
    expect(f.resultado).toBe('reducao_parcial');
    expect(f.versao).toBe(2);
  });

  it('sem custo da instrumentação, a métrica de custo não aparece', () => {
    const e = efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, agora);
    expect(e.metricas.map((m) => m.chave)).toEqual(['chamados', 'reaberturas', 'horas_paradas']);
  });
});

describe('rótulos da efetividade: variação observada, nunca causa', () => {
  const resultados = [
    'reducao_observada',
    'reducao_parcial',
    'sem_mudanca_relevante',
    'aumento_observado',
    'sem_base_de_comparacao',
    'janela_incompleta',
  ] as const;
  const valores = {
    janelaDias: 90,
    reducaoObservada: 60,
    reducaoParcial: 25,
    aumento: 20,
    minChamadosAntes: 3,
    diasDecorridos: 30,
  };
  const chaves = [
    'inteligencia.efetividade.titulo',
    'inteligencia.efetividade.ressalva',
    'inteligencia.efetividade.resultado',
    'inteligencia.efetividade.metrica',
    'inteligencia.efetividade.explicacao',
  ] as const;

  it.each(IDIOMAS)('%s: todo resultado e toda métrica formatam pelo catálogo', (idioma) => {
    const { t } = criarTradutor(idioma);
    for (const c of chaves) expect(CATALOGOS[idioma]).toHaveProperty([c]);
    for (const r of resultados) {
      expect(t('inteligencia.efetividade.resultado', { resultado: r })).not.toMatch(/[{}]|^$/);
      expect(t('inteligencia.efetividade.explicacao', { resultado: r, ...valores })).not.toMatch(
        /[{}]|^$/,
      );
    }
    for (const m of ['chamados', 'reaberturas', 'horas_paradas', 'custo'])
      expect(t('inteligencia.efetividade.metrica', { metrica: m })).not.toMatch(/[{}]|^$/);
  });

  it('pt-BR: os rótulos aprovados', () => {
    const { t } = criarTradutor('pt-BR');
    expect(
      resultados.map((r) => t('inteligencia.efetividade.resultado', { resultado: r })),
    ).toEqual([
      'Redução observada',
      'Redução parcial',
      'Sem mudança relevante',
      'Aumento observado',
      'Sem base de comparação',
      'Janela incompleta',
    ]);
    expect(
      t('inteligencia.efetividade.explicacao', { resultado: 'reducao_parcial', ...valores }),
    ).toBe('Os chamados caíram de 25% a menos de 60% em relação aos 90 dias antes.');
  });

  it.each(IDIOMAS)('%s: nenhum texto fala em causa nem em problema resolvido', (idioma) => {
    // O PRD (princípio 7) e o ADR-036: o resultado é variação observada, nunca causa.
    const causal = /resolv|solved|résolu|resuelt|causou|caused|causó|causé|fixed|corrig/i;
    const textos = Object.entries(CATALOGOS[idioma])
      .filter(([k]) => k.startsWith('inteligencia.efetividade.'))
      .filter(([k]) => k !== 'inteligencia.efetividade.ressalva');
    expect(textos.length).toBe(4);
    for (const [k, texto] of textos) expect([k, causal.test(texto ?? '')]).toEqual([k, false]);
  });
});
