// O job diário de um tenant (ADR-036), com as fontes e a gravação em memória.
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoDia,
  type CorretivaDaFonte,
  type HotelDoDia,
  type TransicaoDaOs,
  executarDiaDoTenant,
  fimDoDia,
} from '../src';
import {
  BancoEmMemoria,
  type DadosDoTenant,
  FonteEmMemoria,
  GravacaoEmMemoria,
  chamadoDaCorretiva,
  chaveDeTeste,
} from './apoio-job';
import { agora, dia } from './apoio';

const hoteis: HotelDoDia[] = [
  { hotelId: 'h1', bandeiraId: 'b1', versaoPolitica: 'hotel:p1@2026-09-01' },
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

let seq = 0;
const corretiva = (
  p: Partial<CorretivaDaFonte> & { abertaEm: Date; transicoes?: TransicaoDaOs[] },
): CorretivaDaFonte => {
  seq += 1;
  return {
    id: `c${seq}`,
    hotelId: 'h1',
    localId: 'l1',
    ativoId: 'a1',
    codigoFalha: null,
    transicoes: [],
    ...p,
  };
};

/** Seis corretivas em 30 dias, com a conclusão e a reabertura nas transições, e impacto no hóspede. */
const pesado = (ativoId: string): CorretivaDaFonte[] =>
  Array.from({ length: 6 }, (_, i) =>
    corretiva({
      ativoId,
      abertaEm: dia(-1 - i * 5),
      codigoFalha: 'compressor',
      impactoHospede: true,
      transicoes: [
        { acao: 'concluir', para: 'concluida', quando: dia(-i * 5) },
        ...(i < 3
          ? [
              { acao: 'reabrir', para: 'em_execucao', quando: dia(-i * 5 + 0.5) } as const,
              { acao: 'concluir', para: 'concluida', quando: dia(-i * 5 + 0.6) } as const,
            ]
          : []),
      ],
    }),
  );

function cenario(extra: Partial<DadosDoTenant> = {}) {
  const banco = new BancoEmMemoria();
  const dados: DadosDoTenant = {
    hoteis,
    ativos: [
      ativo({ id: 'a1', criticidade: 5, paradas: [{ inicio: dia(-3), fim: null }] }),
      ativo({ id: 'a2', hotelId: 'h2' }),
    ],
    corretivas: [...pesado('a1'), corretiva({ ativoId: 'a2', hotelId: 'h2', abertaEm: dia(-40) })],
    locais: [],
    ...extra,
  };
  const fonte = new FonteEmMemoria(banco, dados);
  const portas = { fonte, gravacao: new GravacaoEmMemoria(banco) };
  return { banco, dados, fonte, portas };
}

describe('executarDiaDoTenant: o dia normal', () => {
  it('grava a métrica de cada ativo com as versões, e abre o insight do ativo pesado', async () => {
    const { banco, portas } = cenario();
    const r = await executarDiaDoTenant(portas, { agora });

    expect(r).toEqual({
      dia: '2026-09-30',
      recalculo: false,
      semModulo: false,
      ativos: 2,
      metricasGravadas: 2,
      metricasJaGravadas: 0,
      insightsAbertos: 1,
      insightsAtualizados: 0,
      insightsIgnorados: 0,
    });
    expect(
      banco.metricas.map((m) => [m.ativoId, m.calculo, m.recalculo, m.versaoPolitica]),
    ).toEqual([
      ['a1', 1, false, 'hotel:p1@2026-09-01'],
      ['a2', 1, false, 'padrao'],
    ]);
    expect(banco.insights).toHaveLength(1);
    expect(banco.insights[0]).toMatchObject({
      tipo: 'atencao_ativo',
      familia: 'atencao_ativo|ativoId=a1|hotelId=h1',
      hotelIds: ['h1'],
      estado: 'novo',
      anteriorId: null,
    });
  });

  it('a conclusão e as reaberturas saem das transições, até o dia calculado', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora });
    const a1 = banco.metricas.find((m) => m.ativoId === 'a1');
    expect(a1?.reincidencia).toBeGreaterThan(0);
    // Sem as transições, a reincidência perde o que depende de conclusão e de reabertura.
    const sem = cenario({
      corretivas: pesado('a1').map((c) => ({ ...c, transicoes: [] })),
    });
    await executarDiaDoTenant(sem.portas, { agora });
    const semA1 = sem.banco.metricas.find((m) => m.ativoId === 'a1');
    expect(semA1?.reincidencia).toBeLessThan(a1?.reincidencia ?? 0);
  });

  it('rodar duas vezes no mesmo dia não duplica a métrica nem o insight', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora });
    const segunda = await executarDiaDoTenant(portas, {
      agora: new Date(agora.getTime() + 3_600_000),
    });
    expect(segunda).toMatchObject({
      metricasGravadas: 0,
      metricasJaGravadas: 2,
      insightsAbertos: 0,
      insightsAtualizados: 1,
    });
    expect(banco.metricas).toHaveLength(2);
    expect(banco.insights).toHaveLength(1);
  });

  it('hotéis em fusos diferentes: cada linha no dia local do hotel, sem duplicar na segunda rodada', async () => {
    // 02:30 UTC: ainda 30/09 em São Paulo, já 01/10 em Lisboa.
    const instante = new Date('2026-10-01T02:30:00.000Z');
    const { banco, portas } = cenario({
      hoteis: [
        { hotelId: 'h1', bandeiraId: 'b1', fuso: 'America/Sao_Paulo' },
        { hotelId: 'h2', bandeiraId: 'b1', fuso: 'Europe/Lisbon' },
      ],
    });
    const primeira = await executarDiaDoTenant(portas, { agora: instante });
    expect(primeira).toMatchObject({ dia: '2026-09-30', metricasGravadas: 2 });
    expect(banco.metricas.map((m) => [m.ativoId, m.dia])).toEqual([
      ['a1', '2026-09-30'],
      ['a2', '2026-10-01'],
    ]);
    const segunda = await executarDiaDoTenant(portas, {
      agora: new Date(instante.getTime() + 600_000),
    });
    expect(segunda).toMatchObject({ metricasGravadas: 0, metricasJaGravadas: 2 });
  });

  it('o job nunca muda o estado de um insight que uma pessoa já tocou', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora });
    (banco.insights[0] as { estado: string }).estado = 'em_acao';
    await executarDiaDoTenant(portas, { agora: dia(1) });
    expect(banco.insights).toHaveLength(1);
    expect(banco.insights[0]?.estado).toBe('em_acao');
  });

  it('lê ativos e chamados desde o início da leitura, e o chamado cancelado sem OS não conta', async () => {
    const cancelado = {
      ...chamadoDaCorretiva(corretiva({ ativoId: 'a2', hotelId: 'h2', abertaEm: dia(-2) })),
      estado: 'cancelado' as const,
      os: [],
    };
    const { banco, fonte, portas } = cenario({ chamados: [cancelado] });
    await executarDiaDoTenant(portas, { agora });
    expect(fonte.desde).toEqual([dia(-365), dia(-365)]);
    // Com o cancelado contando, a2 teria uma corretiva a mais na janela da reincidência.
    const scores = (b: BancoEmMemoria) =>
      b.metricas.map((m) => [m.ativoId, m.reincidencia, m.atencao]);
    const sem = cenario();
    await executarDiaDoTenant(sem.portas, { agora });
    expect(scores(banco)).toEqual(scores(sem.banco));
    const aberto = cenario({ chamados: [{ ...cancelado, estado: 'aberto' }] });
    await executarDiaDoTenant(aberto.portas, { agora });
    expect(scores(aberto.banco)).not.toEqual(scores(sem.banco));
  });
});

describe('executarDiaDoTenant: o recálculo', () => {
  it('grava outra linha por ativo, marcada como recálculo, e não toca nos insights', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora: dia(-1) });
    const insightsAntes = banco.insights.map((i) => ({ ...i }));

    const r = await executarDiaDoTenant(portas, {
      agora: fimDoDia(dia(-1).toISOString().slice(0, 10)),
      recalculo: true,
    });
    expect(r).toMatchObject({ recalculo: true, metricasGravadas: 2, insightsAbertos: 0 });
    expect(banco.metricas.map((m) => [m.ativoId, m.dia, m.calculo, m.recalculo])).toEqual([
      ['a1', '2026-09-29', 1, false],
      ['a2', '2026-09-29', 1, false],
      ['a1', '2026-09-29', 2, true],
      ['a2', '2026-09-29', 2, true],
    ]);
    expect(banco.insights).toEqual(insightsAntes);
  });

  it('um dia que nunca foi gravado, recalculado, entra com o cálculo 1 e a marca', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora: fimDoDia('2026-09-20'), recalculo: true });
    expect(banco.metricas.map((m) => [m.dia, m.calculo, m.recalculo])).toEqual([
      ['2026-09-20', 1, true],
      ['2026-09-20', 1, true],
    ]);
  });
});

describe('executarDiaDoTenant: o registro de cada execução', () => {
  it('quem disparou, o resumo, as versões das fórmulas e a da política de cada hotel', async () => {
    const { banco, portas } = cenario();
    const r = await executarDiaDoTenant(portas, { agora });
    expect(banco.execucoes).toEqual([
      {
        ...r,
        disparadoPor: 'cron',
        versoesDeFormula: { reincidencia: 4, atencao: 6, sistemico: 4 },
        versoesDePolitica: { h1: 'hotel:p1@2026-09-01', h2: 'padrao', h3: 'padrao' },
      },
    ]);
  });

  it('uma por execução, mesmo quando não grava nada; o recálculo leva quem pediu', async () => {
    const { banco, portas } = cenario();
    await executarDiaDoTenant(portas, { agora });
    await executarDiaDoTenant(portas, { agora });
    await executarDiaDoTenant(portas, {
      agora: fimDoDia('2026-09-20'),
      recalculo: true,
      disparadoPor: 'u-gestor',
    });
    expect(
      banco.execucoes.map((e) => [e.disparadoPor, e.dia, e.recalculo, e.metricasGravadas]),
    ).toEqual([
      ['cron', '2026-09-30', false, 2],
      ['cron', '2026-09-30', false, 0],
      ['u-gestor', '2026-09-20', true, 2],
    ]);
  });
});

describe('executarDiaDoTenant: só no tenant com o módulo vigente (I7)', () => {
  const vazio = (dia: string, recalculo = false) => ({
    dia,
    recalculo,
    semModulo: true,
    ativos: 0,
    metricasGravadas: 0,
    metricasJaGravadas: 0,
    insightsAbertos: 0,
    insightsAtualizados: 0,
    insightsIgnorados: 0,
  });

  it('sem o módulo: só lê os módulos, não grava nada', async () => {
    const { banco, fonte, portas } = cenario({ modulos: [] });
    expect(await executarDiaDoTenant(portas, { agora })).toEqual(vazio('2026-09-30'));
    expect(fonte.lidas).toEqual(['modulos']);
    expect(banco.metricas).toEqual([]);
    expect(banco.insights).toEqual([]);
    // Nem o registro da execução: o job não grava nada no tenant sem o módulo.
    expect(banco.execucoes).toEqual([]);
  });

  it('vencido, ainda não iniciado ou de vigência inválida: não roda', async () => {
    for (const modulo of [
      { modulo: 'inteligencia', inicio: dia(-100), fim: agora },
      { modulo: 'inteligencia', inicio: dia(1), fim: null },
      { modulo: 'inteligencia', inicio: dia(-10), fim: dia(-20) },
    ]) {
      const { banco, portas } = cenario({ modulos: [modulo] });
      expect(await executarDiaDoTenant(portas, { agora })).toMatchObject({ semModulo: true });
      expect(banco.metricas).toEqual([]);
    }
  });

  it('vigente em agora, com prazo: roda e lê tudo', async () => {
    const { banco, fonte, portas } = cenario({
      modulos: [{ modulo: 'inteligencia', inicio: dia(-100), fim: dia(1) }],
    });
    expect(await executarDiaDoTenant(portas, { agora })).toMatchObject({
      semModulo: false,
      metricasGravadas: 2,
    });
    expect([...fonte.lidas].sort()).toEqual(
      [
        'ativos',
        'calculosDoDia',
        'corretivas',
        'hoteis',
        'insights',
        'locais',
        'modulos',
        'politicaSistemica',
      ].sort(),
    );
    expect(banco.metricas).toHaveLength(2);
  });

  it('recálculo: vale a vigência no dia recalculado', async () => {
    const inicio = new Date('2026-09-25T03:00:00Z');
    const { banco, portas } = cenario({ modulos: [{ modulo: 'inteligencia', inicio, fim: null }] });
    expect(
      await executarDiaDoTenant(portas, { agora: fimDoDia('2026-09-20'), recalculo: true }),
    ).toEqual(vazio('2026-09-20', true));
    await executarDiaDoTenant(portas, { agora: fimDoDia('2026-09-26'), recalculo: true });
    expect(banco.metricas.map((m) => m.dia)).toEqual(['2026-09-26', '2026-09-26']);
  });
});

describe('executarDiaDoTenant: hotel novo num insight de rede', () => {
  const modelo = (id: string, hotelId: string) =>
    ativo({ id, hotelId, categoriaId: 'hvac', fabricante: 'Acme', modelo: 'X1' });
  const falha = (a: AtivoDoDia, i: number) =>
    corretiva({
      hotelId: a.hotelId,
      ativoId: a.id,
      codigoFalha: 'ruido',
      abertaEm: dia(-i * 7),
    });
  // Outro modelo na categoria, sem chamado: a base com que o modelo se compara.
  const base = ativo({
    id: 'o1',
    hotelId: 'h1',
    categoriaId: 'hvac',
    fabricante: 'Trane',
    modelo: 'T9',
  });
  // Quatro do modelo sem chamado: a população do modelo chega aos 10 do mínimo (v4).
  const instalados = ['s1', 's2', 's3', 's4'].map((id) => modelo(id, 'h1'));
  // Seis ativos em três hotéis (os mínimos do mesmo modelo); um quarto hotel entra depois.
  const hoteisDoModelo: HotelDoDia[] = [...hoteis, { hotelId: 'h4', bandeiraId: 'b2' }];
  const cinco = [
    modelo('m1', 'h1'),
    modelo('m2', 'h1'),
    modelo('m3', 'h2'),
    modelo('m4', 'h2'),
    modelo('m5', 'h3'),
    modelo('m6', 'h3'),
  ];

  it('o novo conjunto abre outro insight, ligado ao anterior, e os dois ficam abertos', async () => {
    const { banco, dados, portas } = cenario({
      hoteis: hoteisDoModelo,
      ativos: [...cinco, ...instalados, base],
      corretivas: cinco.map(falha),
    });
    await executarDiaDoTenant(portas, { agora });
    const sistemicos = () => banco.insights.filter((i) => i.tipo === 'sistemico');
    expect(sistemicos()).toHaveLength(1);
    expect(sistemicos()[0]).toMatchObject({ hotelIds: ['h1', 'h2', 'h3'], anteriorId: null });

    const m7 = modelo('m7', 'h4');
    dados.ativos = [...cinco, m7, ...instalados, base];
    dados.corretivas = [...cinco, m7].map(falha);
    await executarDiaDoTenant(portas, { agora: dia(1) });

    const [anterior, novo] = sistemicos();
    expect(sistemicos()).toHaveLength(2);
    expect(novo).toMatchObject({ hotelIds: ['h1', 'h2', 'h3', 'h4'], anteriorId: anterior?.id });
    expect(anterior?.estado).toBe('novo');
    expect(anterior?.hotelIds).toEqual(['h1', 'h2', 'h3']);
    expect(anterior?.familia).toBe(novo?.familia);
    expect(anterior?.chave).not.toBe(novo?.chave);
    expect(anterior?.chave).toBe(chaveDeTeste(anterior?.familia ?? '', ['h1', 'h2', 'h3']));
  });

  it('saiu hotel: nada a fazer, e o insight maior segue como está', async () => {
    const m7 = modelo('m7', 'h4');
    const todos = [...cinco, m7];
    const { banco, dados, portas } = cenario({
      hoteis: hoteisDoModelo,
      ativos: [...todos, ...instalados, base],
      corretivas: todos.map(falha),
    });
    await executarDiaDoTenant(portas, { agora });
    const antes = banco.insights.map((i) => ({ ...i }));

    dados.ativos = [...cinco, ...instalados, base];
    dados.corretivas = cinco.map(falha);
    const r = await executarDiaDoTenant(portas, { agora: dia(1) });
    expect(r).toMatchObject({ insightsAbertos: 0, insightsAtualizados: 0, insightsIgnorados: 1 });
    expect(banco.insights.map((i) => i.hotelIds)).toEqual(antes.map((i) => i.hotelIds));
  });

  it('descartado "não relevante" silencia a família por 30 dias; "substituído" não', async () => {
    const { banco, portas } = cenario({
      hoteis: hoteisDoModelo,
      ativos: [...cinco, ...instalados, base],
      corretivas: cinco.map(falha),
    });
    await executarDiaDoTenant(portas, { agora });
    const insight = banco.insights.find((i) => i.tipo === 'sistemico');
    if (!insight) throw new Error('sem insight sistêmico');
    Object.assign(insight, {
      estado: 'descartado',
      encerradoEm: dia(1),
      motivoDeDescarte: 'nao_relevante',
    });
    const silenciado = await executarDiaDoTenant(portas, { agora: dia(2) });
    expect(silenciado.insightsIgnorados).toBe(1);
    expect(banco.insights.filter((i) => i.tipo === 'sistemico')).toHaveLength(1);

    insight.motivoDeDescarte = 'substituido';
    const aberto = await executarDiaDoTenant(portas, { agora: dia(3) });
    expect(aberto.insightsAbertos).toBe(1);
    expect(banco.insights.filter((i) => i.tipo === 'sistemico')).toHaveLength(2);
  });
});
