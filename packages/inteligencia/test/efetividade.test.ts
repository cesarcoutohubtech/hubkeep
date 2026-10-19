// Efetividade antes e depois: a mesma janela dos dois lados da intervenção,
// paradas cortadas na data e o resultado sempre como variação observada.
import { CATALOGOS, IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import { describe, expect, it } from 'vitest';
import {
  COBERTURA_MINIMA_DO_CUSTO,
  PADRAO_EFETIVIDADE,
  VERSAO_EFETIVIDADE,
  codigosDeIntervencao,
  efetividadeAntesDepois,
  limiaresDeEfetividadeValidos,
} from '../src';
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
          corretiva({ abertaEm: dia(-35, t), aceitaEm: dia(-30, t), custoInformado: 9800 }),
          corretiva({ abertaEm: dia(25, t), aceitaEm: dia(30, t), custoInformado: 1900 }),
        ],
        paradas: [
          { inicio: dia(-50, t), fim: hora(20, dia(-50, t)) },
          { inicio: hora(-2, t), fim: hora(3, t) },
          { inicio: dia(20, t), fim: hora(4, dia(20, t)) },
        ],
      },
      agora,
    );
    expect(e.resultado).toBe('reducao_observada');
    expect(e.metricas).toEqual([
      { chave: 'chamados', antes: 11, depois: 4, variacaoPercentual: -63.6 },
      { chave: 'reaberturas', antes: 2, depois: 0, variacaoPercentual: -100 },
      // A parada que atravessa a intervenção conta 2 h antes e 3 h depois.
      { chave: 'horas_paradas', antes: 22, depois: 7, variacaoPercentual: -68.2 },
    ]);
    expect(e.custo).toEqual({
      antes: { soma: 9800, informadas: 1, aceitas: 1 },
      depois: { soma: 1900, informadas: 1, aceitas: 1 },
      suficiente: true,
      variacaoPercentual: -80.6,
    });
  });

  it('o depois ainda sem a janela inteira fica como incompleto', () => {
    const e = efetividadeAntesDepois(
      {
        intervencaoEm: dia(-30),
        corretivas: [-40, -50, -60].map((d) => corretiva({ abertaEm: dia(d) })),
        paradas: [],
      },
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

  it('a versão 4, os limiares de 08/10 e a lista de códigos do adendo de 15/10/2026', () => {
    expect(VERSAO_EFETIVIDADE).toBe(4);
    expect(PADRAO_EFETIVIDADE).toEqual({
      janelaDias: 90,
      reducaoObservadaPercentual: 60,
      reducaoParcialPercentual: 25,
      aumentoObservadoPercentual: 20,
      minChamadosAntes: 3,
      codigosDeIntervencao: ['solucao_troca_do_equipamento'],
    });
    expect(COBERTURA_MINIMA_DO_CUSTO).toBe(0.5);
    const e = efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, agora);
    expect(e.versao).toBe(4);
  });

  it('versão 4: o chamado da intervenção fica fora dos chamados, das reaberturas e das paradas', () => {
    const troca = corretiva({ abertaEm: hora(-8, t), reaberturas: 1 });
    const comTroca = (intervencaoId?: string) =>
      efetividadeAntesDepois(
        {
          intervencaoEm: t,
          // Dois chamados de verdade antes: menos que o mínimo de 3.
          corretivas: [...corretivasEm([-60, -30]), troca],
          paradas: [
            { inicio: dia(-30, t), fim: hora(4, dia(-30, t)) },
            // O equipamento parado desde a abertura do chamado da troca até ela.
            { chamadoId: troca.id, inicio: hora(-8, t), fim: t },
          ],
          ...(intervencaoId ? { intervencaoId } : {}),
        },
        agora,
      );
    const v4 = comTroca(troca.id);
    expect(v4.metricas.map((m) => [m.chave, m.antes])).toEqual([
      ['chamados', 2],
      ['reaberturas', 0],
      ['horas_paradas', 4],
    ]);
    // Sem ele, os dois chamados não fazem base de comparação.
    expect(v4.resultado).toBe('sem_base_de_comparacao');
    // Sem saber qual é o chamado da intervenção, tudo conta, como na versão 3.
    expect(comTroca().metricas.map((m) => m.antes)).toEqual([3, 1, 12]);
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

  it('menos de 90 dias depois: janela incompleta, antes das faixas de variação', () => {
    const corretivas = corretivasEm(dez);
    const em = (decorridos: number) =>
      efetividadeAntesDepois({ intervencaoEm: t, corretivas, paradas: [] }, dia(decorridos, t))
        .resultado;
    expect(em(0)).toBe('janela_incompleta');
    expect(em(89)).toBe('janela_incompleta');
    expect(em(90)).toBe('reducao_observada');
  });

  it('sem base e janela incompleta: sem base prevalece, já no dia da intervenção, e não muda', () => {
    const doisAntes = corretivasEm([-5, -30]);
    const em = (decorridos: number, corretivas = doisAntes) =>
      efetividadeAntesDepois({ intervencaoEm: t, corretivas, paradas: [] }, dia(decorridos, t))
        .resultado;
    for (const d of [0, 10, 89, 90, 200]) expect(em(d)).toBe('sem_base_de_comparacao');
    for (const d of [0, 10, 90]) expect(em(d, [])).toBe('sem_base_de_comparacao');
    // Com 3 antes, a base existe, e a janela volta a valer até o dia 90.
    expect(em(10, corretivasEm([-5, -30, -60]))).toBe('janela_incompleta');
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
    expect(f.versao).toBe(4);
  });

  it('o custo fica nas métricas de chamados, reaberturas e tempo parado, e não entre elas', () => {
    const e = efetividadeAntesDepois({ intervencaoEm: t, corretivas: [], paradas: [] }, agora);
    expect(e.metricas.map((m) => m.chave)).toEqual(['chamados', 'reaberturas', 'horas_paradas']);
  });
});

describe('custo das corretivas, antes → depois, com a cobertura (adendo ao ADR-033)', () => {
  const aceita = (d: number, custoInformado: number | null) =>
    corretiva({ abertaEm: dia(d - 2, t), aceitaEm: dia(d, t), custoInformado });
  const custo = (corretivas: ReturnType<typeof corretiva>[], intervencaoId?: string) =>
    efetividadeAntesDepois(
      { intervencaoEm: t, corretivas, paradas: [], ...(intervencaoId ? { intervencaoId } : {}) },
      agora,
    ).custo;

  it('50% de cobertura nos dois lados basta; a variação vem das somas', () => {
    const c = custo([aceita(-10, 400), aceita(-20, null), aceita(10, 100), aceita(20, null)]);
    expect(c).toEqual({
      antes: { soma: 400, informadas: 1, aceitas: 2 },
      depois: { soma: 100, informadas: 1, aceitas: 2 },
      suficiente: true,
      variacaoPercentual: -75,
    });
  });

  it('abaixo de 50% em qualquer um dos lados: dados insuficientes, sem variação', () => {
    const depoisCurto = custo([
      aceita(-10, 400),
      aceita(10, 100),
      aceita(20, null),
      aceita(30, null),
    ]);
    expect(depoisCurto.depois).toEqual({ soma: 100, informadas: 1, aceitas: 3 });
    expect([depoisCurto.suficiente, depoisCurto.variacaoPercentual]).toEqual([false, null]);
    const antesCurto = custo([
      aceita(-10, null),
      aceita(-20, null),
      aceita(-30, 50),
      aceita(5, 10),
    ]);
    expect([antesCurto.suficiente, antesCurto.variacaoPercentual]).toEqual([false, null]);
  });

  it('o lado sem OS aceita tem custo zero conhecido; com o antes em zero, não há porcentagem', () => {
    const semDepois = custo([aceita(-10, 400)]);
    expect([semDepois.suficiente, semDepois.variacaoPercentual]).toEqual([true, -100]);
    const semAntes = custo([aceita(10, 400)]);
    expect([semAntes.suficiente, semAntes.variacaoPercentual]).toEqual([true, null]);
  });

  it('conta pelo aceite, e não pela abertura; a OS sem aceite fica fora', () => {
    const c = custo([
      corretiva({ abertaEm: dia(-5, t), aceitaEm: dia(3, t), custoInformado: 70 }),
      corretiva({ abertaEm: dia(-5, t), aceitaEm: null, custoInformado: 999 }),
    ]);
    expect(c.antes.aceitas).toBe(0);
    expect(c.depois).toEqual({ soma: 70, informadas: 1, aceitas: 1 });
  });

  it('a OS da própria intervenção (o custo da troca) fica fora dos dois lados', () => {
    const troca = corretiva({ abertaEm: dia(-3, t), aceitaEm: dia(1, t), custoInformado: 50_000 });
    const c = custo([aceita(-10, 400), troca, aceita(10, 100)], troca.id);
    expect(c.depois).toEqual({ soma: 100, informadas: 1, aceitas: 1 });
    expect(c.variacaoPercentual).toBe(-75);
  });
});

describe('códigos de intervenção na política', () => {
  it('ausentes na política anterior à versão 3: vale o padrão', () => {
    const antiga = { ...PADRAO_EFETIVIDADE };
    delete antiga.codigosDeIntervencao;
    expect(codigosDeIntervencao(antiga)).toEqual(['solucao_troca_do_equipamento']);
    expect(limiaresDeEfetividadeValidos(antiga)).toBe(true);
  });

  it('a lista vazia desliga; repetido, vazio, com espaço ou mais de 20 não valem', () => {
    const com = (codigosDeIntervencao: unknown) =>
      limiaresDeEfetividadeValidos({
        ...PADRAO_EFETIVIDADE,
        codigosDeIntervencao: codigosDeIntervencao as string[],
      });
    expect(com([])).toBe(true);
    expect(com(['solucao_troca_de_peca', '0199a1b2-0000-7000-8000-000000000001'])).toBe(true);
    expect(com(['a', 'a'])).toBe(false);
    expect(com([''])).toBe(false);
    expect(com([' a'])).toBe(false);
    expect(com([1])).toBe(false);
    expect(com(Array.from({ length: 21 }, (_, i) => `c${i}`))).toBe(false);
    expect(com('solucao_troca_do_equipamento')).toBe(false);
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
    expect(
      t('inteligencia.efetividade.explicacao', { resultado: 'sem_base_de_comparacao', ...valores }),
    ).toBe(
      'Houve menos de 3 chamados nos 90 dias antes da intervenção. Esse resultado já vale no dia da intervenção e não muda quando a janela terminar.',
    );
  });

  it.each(IDIOMAS)('%s: nenhum texto fala em causa nem em problema resolvido', (idioma) => {
    // O PRD (princípio 7) e o ADR-036: o resultado é variação observada, nunca causa.
    const causal = /resolv|solved|résolu|resuelt|causou|caused|causó|causé|fixed|corrig/i;
    const textos = Object.entries(CATALOGOS[idioma])
      .filter(([k]) => k.startsWith('inteligencia.efetividade.'))
      .filter(([k]) => k !== 'inteligencia.efetividade.ressalva');
    // Os 4 do motor e os 23 das telas (adendo ao ADR-033, 15/10/2026).
    expect(textos.length).toBe(27);
    for (const [k, texto] of textos) expect([k, causal.test(texto ?? '')]).toEqual([k, false]);
  });
});
