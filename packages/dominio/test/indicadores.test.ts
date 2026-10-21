// Painel de indicadores da 1c (item 8): as definições do glossário único de
// métricas (versão 3), o período em dias locais do hotel, a soma das parciais
// e quem vê o quê.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type ChamadoDoIndicador,
  type EntradaDoHotel,
  type OsDoIndicador,
  type Papel,
  type PreventivaDoIndicador,
  type TransicaoDoServico,
  indicadoresDaParcial,
  indicadoresDoDia,
  inicioDoDiaLocal,
  ondeMaisQuebra,
  intervaloNoFuso,
  parcialDoHotel,
  podeVerIndicadores,
  resolverPolitica,
  somarParciais,
  amostraSuficiente,
  validarPeriodoDoPainel,
  validarPolitica,
  visaoDoHotel,
} from '../src/index';

const SP = 'America/Sao_Paulo';
const AGORA = new Date('2026-10-15T12:00:00Z');
const PERIODO = { inicio: '2026-10-01', fim: '2026-10-10' };
const t = (iso: string) => new Date(iso);

const transicoes = (...p: [TransicaoDoServico['acao'], string][]): TransicaoDoServico[] =>
  p.map(([acao, quando]) => ({ acao, quando: t(quando) }));

const os = (
  id: string,
  estado: OsDoIndicador['estado'],
  trs: TransicaoDoServico[],
  equipeId: string | null = 'e1',
): OsDoIndicador => ({ id, estado, equipeId, transicoes: trs });

const chamado = (
  id: string,
  abertoEm: string,
  extra: Partial<ChamadoDoIndicador> = {},
): ChamadoDoIndicador => ({
  id,
  estado: 'em_execucao',
  abertoEm: t(abertoEm),
  prazoSolucao: null,
  pausadoSegundos: 0,
  categoriaId: null,
  os: [],
  ...extra,
});

const concluida = (id: string, quando: string, equipeId: string | null = 'e1') =>
  os(
    id,
    'concluida',
    transicoes(['gerar', '2026-09-01T00:00:00Z'], ['concluir', quando]),
    equipeId,
  );

const preventiva = (
  id: string,
  dataPrevista: string,
  estado: OsDoIndicador['estado'],
  trs: TransicaoDoServico[] = [],
): PreventivaDoIndicador => ({ id, estado, equipeId: 'e1', transicoes: trs, dataPrevista });

const hotel = (extra: Partial<EntradaDoHotel> = {}): EntradaDoHotel => ({
  hotelId: 'h1',
  fuso: SP,
  uhsAtivas: 200,
  toleranciaDias: 0,
  chamados: [],
  preventivas: [],
  periodosDeUh: [],
  apontamentos: [],
  ...extra,
});

const indicadores = (e: EntradaDoHotel) => indicadoresDaParcial(parcialDoHotel(e, PERIODO, AGORA));

describe('período do painel', () => {
  it('aceita de 1 a 92 dias, com dias válidos', () => {
    expect(() => validarPeriodoDoPainel({ inicio: '2026-10-01', fim: '2026-10-01' })).not.toThrow();
    expect(() => validarPeriodoDoPainel({ inicio: '2026-07-15', fim: '2026-10-14' })).not.toThrow();
  });

  it('recusa o fim antes do início, mais de 92 dias e o dia inexistente, com código', () => {
    for (const p of [
      { inicio: '2026-10-02', fim: '2026-10-01' },
      { inicio: '2026-07-14', fim: '2026-10-14' },
      { inicio: '2026-02-30', fim: '2026-03-01' },
      { inicio: '2026-10-1', fim: '2026-10-02' },
    ]) {
      expect(() => validarPeriodoDoPainel(p)).toThrow(
        expect.objectContaining({
          codigo: 'indicadores_periodo_invalido',
          parametros: { maximoDias: 92 },
        }),
      );
    }
  });

  it('vira instantes no fuso do hotel, do começo do primeiro dia ao começo do dia seguinte ao fim', () => {
    expect(intervaloNoFuso(PERIODO, SP)).toEqual({
      de: t('2026-10-01T03:00:00Z'),
      ate: t('2026-10-11T03:00:00Z'),
    });
    expect(intervaloNoFuso(PERIODO, 'Europe/Lisbon').de).toEqual(t('2026-09-30T23:00:00Z'));
  });

  it('o dia sem meia-noite (o salto do horário de verão) começa logo depois do salto', () => {
    // Em 2018, o horário de verão de São Paulo começou em 04/11, à meia-noite.
    expect(inicioDoDiaLocal('2018-11-04', SP)).toEqual(t('2018-11-04T03:00:00Z'));
  });
});

describe('backlog e backlog por idade', () => {
  it('conta os não cancelados sem a conclusão do serviço no fim do período, pela idade em dias completos', () => {
    const r = indicadores(
      hotel({
        chamados: [
          chamado('a', '2026-10-10T12:00:00Z'), // 0 dia no fim do período
          chamado('b', '2026-10-08T00:00:00Z'), // 3 dias
          chamado('c', '2026-09-20T00:00:00Z'), // 21 dias
          chamado('d', '2026-08-01T00:00:00Z'), // mais de 30
          chamado('e', '2026-10-05T00:00:00Z', { estado: 'cancelado' }),
          chamado('f', '2026-10-02T00:00:00Z', { os: [concluida('of', '2026-10-04T00:00:00Z')] }),
          chamado('g', '2026-10-12T00:00:00Z'), // depois do fim do período
          // concluída depois do fim do período: estava no backlog no fim dele
          chamado('h', '2026-10-09T00:00:00Z', { os: [concluida('oh', '2026-10-13T00:00:00Z')] }),
        ],
      }),
    );
    expect(r.backlog).toBe(5);
    expect(r.backlogPorIdade).toEqual({
      ate_2: 2,
      de_3_a_7: 1,
      de_8_a_15: 0,
      de_16_a_30: 1,
      mais_de_30: 1,
    });
    expect(r.backlogPor100Uhs).toBe(2.5);
  });

  it('a OS reaberta volta o chamado ao backlog', () => {
    const reaberta = os(
      'o',
      'em_execucao',
      transicoes(['concluir', '2026-10-03T00:00:00Z'], ['reabrir', '2026-10-04T00:00:00Z']),
    );
    expect(
      indicadores(hotel({ chamados: [chamado('a', '2026-10-02T00:00:00Z', { os: [reaberta] })] }))
        .backlog,
    ).toBe(1);
  });
});

describe('% de SLA', () => {
  const prazo = (iso: string) => ({ prazoSolucao: t(iso) });
  it('dos chamados com o prazo de solução vencendo no período, os concluídos até o prazo', () => {
    const r = indicadores(
      hotel({
        chamados: [
          chamado('dentro', '2026-10-01T10:00:00Z', {
            ...prazo('2026-10-05T10:00:00Z'),
            pausadoSegundos: 3600,
            os: [concluida('o1', '2026-10-05T10:00:00Z')], // no instante do prazo: dentro
          }),
          chamado('fora', '2026-10-01T10:00:00Z', {
            ...prazo('2026-10-05T10:00:00Z'),
            os: [concluida('o2', '2026-10-05T10:00:01Z')],
          }),
          chamado('vencido_aberto', '2026-10-01T10:00:00Z', prazo('2026-10-06T10:00:00Z')),
          chamado('prazo_fora_do_periodo', '2026-10-01T10:00:00Z', prazo('2026-10-12T10:00:00Z')),
          chamado('sem_prazo', '2026-10-01T10:00:00Z'),
          chamado('cancelado', '2026-10-01T10:00:00Z', {
            ...prazo('2026-10-05T10:00:00Z'),
            estado: 'cancelado',
          }),
        ],
      }),
    );
    expect(r.sla).toMatchObject({
      total: 3,
      dentroDoPrazo: 1,
      aindaNoPrazo: 0,
      pausadoSegundos: 3600,
    });
    expect(r.sla.pausadoMedioSegundos).toBe(1200);
    expect(r.percentualDeSla).toBe(33.3);
  });

  it('o prazo no período que ainda corre, sem conclusão, fica fora da conta até vencer', () => {
    const r = indicadoresDaParcial(
      parcialDoHotel(
        hotel({ chamados: [chamado('a', '2026-10-14T00:00:00Z', prazo('2026-10-15T18:00:00Z'))] }),
        { inicio: '2026-10-14', fim: '2026-10-15' },
        AGORA,
      ),
    );
    expect(r.sla).toMatchObject({ total: 0, aindaNoPrazo: 1 });
    expect(r.percentualDeSla).toBeNull();
  });
});

describe('MTTR', () => {
  it('média e mediana, em horas corridas, da abertura à última conclusão no período', () => {
    const reabertaEConcluida = os(
      'o3',
      'concluida',
      transicoes(
        ['concluir', '2026-10-02T00:00:00Z'],
        ['reabrir', '2026-10-02T06:00:00Z'],
        ['concluir', '2026-10-03T00:00:00Z'],
      ),
    );
    const r = indicadores(
      hotel({
        chamados: [
          chamado('a', '2026-10-02T00:00:00Z', { os: [concluida('o1', '2026-10-02T10:00:00Z')] }), // 10 h
          chamado('b', '2026-10-02T00:00:00Z', { os: [concluida('o2', '2026-10-02T20:00:00Z')] }), // 20 h
          chamado('c', '2026-10-01T00:00:00Z', { os: [reabertaEConcluida] }), // 48 h
          chamado('d', '2026-09-01T00:00:00Z', { os: [concluida('o4', '2026-10-12T00:00:00Z')] }), // fora
          chamado('e', '2026-10-01T00:00:00Z', {
            estado: 'cancelado',
            os: [concluida('o5', '2026-10-02T00:00:00Z')],
          }),
        ],
      }),
    );
    expect(r.corretivasConcluidas).toBe(3);
    expect(r.mttrHoras).toBe(26);
    expect(r.medianaHoras).toBe(20);
  });

  it('sem conclusão no período, nem média nem mediana', () => {
    const r = indicadores(hotel());
    expect([r.mttrHoras, r.medianaHoras]).toEqual([null, null]);
  });
});

describe('% de preventiva em dia, preventiva atrasada e razão', () => {
  const concluir = (quando: string) =>
    transicoes(['gerar', '2026-09-01T00:00:00Z'], ['concluir', quando]);

  it('concluída até o fim do dia previsto, no fuso do hotel, mais a tolerância', () => {
    const preventivas = [
      // 05/10 termina às 03:00 Z do dia 06
      preventiva('p1', '2026-10-05', 'concluida', concluir('2026-10-06T02:59:59Z')),
      preventiva('p2', '2026-10-05', 'concluida', concluir('2026-10-06T03:00:00Z')),
      preventiva('p3', '2026-10-05', 'atribuida'),
      preventiva('p4', '2026-10-05', 'cancelada'),
      preventiva('p5', '2026-10-20', 'atribuida'), // fora do período
    ];
    const sem = indicadores(hotel({ preventivas }));
    expect(sem.preventiva).toEqual({ total: 3, emDia: 1, atrasadas: 1, aindaNoPrazo: 0 });
    expect(sem.percentualDePreventivaEmDia).toBe(33.3);

    const comUmDia = indicadores(hotel({ preventivas, toleranciaDias: 1 }));
    expect(comUmDia.preventiva).toEqual({ total: 3, emDia: 2, atrasadas: 1, aindaNoPrazo: 0 });
  });

  it('com o limite ainda por vir e sem conclusão, fica fora da conta', () => {
    const r = indicadoresDaParcial(
      parcialDoHotel(
        hotel({ preventivas: [preventiva('p', '2026-10-15', 'atribuida')] }),
        { inicio: '2026-10-15', fim: '2026-10-15' },
        AGORA,
      ),
    );
    expect(r.preventiva).toEqual({ total: 0, emDia: 0, atrasadas: 0, aindaNoPrazo: 1 });
    expect(r.percentualDePreventivaEmDia).toBeNull();
  });

  it('a razão: as preventivas concluídas no período para cada corretiva concluída nele', () => {
    const r = indicadores(
      hotel({
        preventivas: [
          preventiva('p1', '2026-09-28', 'concluida', concluir('2026-10-02T12:00:00Z')),
          preventiva('p2', '2026-10-02', 'concluida', concluir('2026-10-03T12:00:00Z')),
          preventiva('p3', '2026-10-03', 'aceita', concluir('2026-10-04T12:00:00Z')),
        ],
        chamados: [
          chamado('a', '2026-10-02T00:00:00Z', { os: [concluida('o1', '2026-10-02T10:00:00Z')] }),
          chamado('b', '2026-10-02T00:00:00Z', { os: [concluida('o2', '2026-10-03T10:00:00Z')] }),
        ],
      }),
    );
    expect(r.preventivasConcluidas).toBe(3);
    expect(r.preventivasPorCorretiva).toBe(1.5);
    expect(r.percentualDePreventivas).toBe(60);
  });
});

describe('chamados por 100 UHs, UH-dias e série diária', () => {
  it('os abertos no período sobre as UHs ativas, e nulo sem UH', () => {
    const chamados = [
      chamado('a', '2026-10-01T03:00:00Z'),
      chamado('b', '2026-10-11T02:59:59Z'),
      chamado('c', '2026-10-11T03:00:00Z'),
      chamado('d', '2026-10-05T00:00:00Z', { estado: 'cancelado' }),
    ];
    expect(indicadores(hotel({ chamados, uhsAtivas: 40 })).chamadosPor100Uhs).toBe(5);
    expect(indicadores(hotel({ chamados, uhsAtivas: 0 })).chamadosPor100Uhs).toBeNull();
  });

  it('os UH-dias perdidos no período, sem o chamado cancelado', () => {
    const r = indicadores(
      hotel({
        periodosDeUh: [
          {
            chamadoId: 'a',
            hotelId: 'h1',
            localId: 'uh1',
            inicio: t('2026-10-01T03:00:00Z'),
            fim: t('2026-10-03T03:00:00Z'),
          },
          {
            chamadoId: 'b',
            hotelId: 'h1',
            localId: 'uh2',
            inicio: t('2026-10-10T03:00:00Z'),
            fim: null,
          },
          {
            chamadoId: 'c',
            hotelId: 'h1',
            localId: 'uh3',
            inicio: t('2026-10-01T03:00:00Z'),
            fim: null,
            chamadoCancelado: true,
          },
        ],
      }),
    );
    expect(r.uhDias).toBe(3);
  });

  it('a série: o backlog no fim de cada dia local, os abertos e os encerrados', () => {
    const p = parcialDoHotel(
      hotel({
        chamados: [
          chamado('a', '2026-10-01T12:00:00Z', { os: [concluida('o1', '2026-10-02T12:00:00Z')] }),
          chamado('b', '2026-10-02T02:00:00Z'), // 01/10 às 23:00 em São Paulo
        ],
      }),
      { inicio: '2026-10-01', fim: '2026-10-03' },
      AGORA,
    );
    expect(
      p.serie.map(({ dia, backlog, abertos, encerrados }) => ({
        dia,
        backlog,
        abertos,
        encerrados,
      })),
    ).toEqual([
      { dia: '2026-10-01', backlog: 2, abertos: 2, encerrados: 0 },
      { dia: '2026-10-02', backlog: 1, abertos: 0, encerrados: 1 },
      { dia: '2026-10-03', backlog: 1, abertos: 0, encerrados: 0 },
    ]);
  });

  it('a série: o % de SLA, o MTTR e a preventiva em dia de cada dia, com o dia no lugar do período', () => {
    const p = parcialDoHotel(
      hotel({
        chamados: [
          // Prazo e conclusão em 02/10 local: dentro, 26 horas.
          chamado('x', '2026-10-01T12:00:00Z', {
            prazoSolucao: t('2026-10-02T15:00:00Z'),
            os: [concluida('ox', '2026-10-02T14:00:00Z')],
          }),
          // Concluído depois do prazo, em 02/10: fora, 30 horas.
          chamado('y', '2026-10-01T12:00:00Z', {
            prazoSolucao: t('2026-10-02T16:00:00Z'),
            os: [concluida('oy', '2026-10-02T18:00:00Z')],
          }),
          // Vencido em 03/10 sem conclusão: fora.
          chamado('z', '2026-10-01T12:00:00Z', { prazoSolucao: t('2026-10-03T12:00:00Z') }),
        ],
        preventivas: [
          preventiva(
            'p1',
            '2026-10-01',
            'concluida',
            transicoes(['concluir', '2026-10-01T20:00:00Z']),
          ),
          preventiva('p2', '2026-10-01', 'atribuida'),
          preventiva('p3', '2026-10-03', 'cancelada'),
        ],
      }),
      { inicio: '2026-10-01', fim: '2026-10-03' },
      AGORA,
    );
    expect(p.serie.map(indicadoresDoDia)).toEqual([
      {
        dia: '2026-10-01',
        backlog: 3,
        abertos: 3,
        encerrados: 0,
        percentualDeSla: null,
        mttrHoras: null,
        percentualDePreventivaEmDia: 50,
      },
      {
        dia: '2026-10-02',
        backlog: 1,
        abertos: 0,
        encerrados: 2,
        percentualDeSla: 50,
        mttrHoras: 28,
        percentualDePreventivaEmDia: null,
      },
      {
        dia: '2026-10-03',
        backlog: 1,
        abertos: 0,
        encerrados: 0,
        percentualDeSla: 0,
        mttrHoras: null,
        percentualDePreventivaEmDia: null,
      },
    ]);
  });

  it('o prazo do dia que ainda corre fica fora da conta do dia até vencer', () => {
    const p = parcialDoHotel(
      hotel({
        chamados: [
          chamado('a', '2026-10-14T00:00:00Z', { prazoSolucao: t('2026-10-15T18:00:00Z') }),
        ],
      }),
      { inicio: '2026-10-15', fim: '2026-10-15' },
      AGORA,
    );
    expect(p.serie[0]?.sla).toEqual({ total: 0, dentroDoPrazo: 0 });
  });

  it('a série para no dia de hoje', () => {
    const p = parcialDoHotel(hotel(), { inicio: '2026-10-14', fim: '2026-10-20' }, AGORA);
    expect(p.serie.map((d) => d.dia)).toEqual(['2026-10-14', '2026-10-15']);
  });
});

describe('produtividade por equipe e hotel', () => {
  it('as OS concluídas no período e as horas apontadas dentro dele, por equipe', () => {
    const p = parcialDoHotel(
      hotel({
        chamados: [
          chamado('a', '2026-10-02T00:00:00Z', {
            os: [concluida('o1', '2026-10-02T10:00:00Z', 'e1')],
          }),
          chamado('b', '2026-10-02T00:00:00Z', {
            os: [concluida('o2', '2026-10-03T10:00:00Z', null)],
          }),
        ],
        preventivas: [
          preventiva(
            'p1',
            '2026-10-02',
            'concluida',
            transicoes(['concluir', '2026-10-02T12:00:00Z']),
          ),
        ],
        apontamentos: [
          { osId: 'o1', inicio: t('2026-10-02T08:00:00Z'), fim: t('2026-10-02T10:00:00Z') },
          // corta no começo do período
          { osId: 'p1', inicio: t('2026-10-01T02:00:00Z'), fim: t('2026-10-01T04:00:00Z') },
          { osId: 'outra', inicio: t('2026-10-02T08:00:00Z'), fim: t('2026-10-02T10:00:00Z') },
        ],
      }),
      PERIODO,
      AGORA,
    );
    expect(p.produtividade).toEqual([
      { hotelId: 'h1', equipeId: 'e1', osConcluidas: 2, segundosApontados: 3 * 3600 },
      { hotelId: 'h1', equipeId: null, osConcluidas: 1, segundosApontados: 0 },
    ]);
  });
});

describe('soma das parciais (rede e bandeira)', () => {
  it('os percentuais e o MTTR saem do conjunto, e a série soma pelo dia', () => {
    const h1 = parcialDoHotel(
      hotel({
        uhsAtivas: 100,
        chamados: [
          chamado('a', '2026-10-02T00:00:00Z', {
            prazoSolucao: t('2026-10-03T00:00:00Z'),
            os: [concluida('o1', '2026-10-02T10:00:00Z')],
          }),
        ],
        periodosDeUh: [
          {
            chamadoId: 'a',
            hotelId: 'h1',
            localId: 'uh',
            inicio: t('2026-10-02T03:00:00Z'),
            fim: t('2026-10-03T03:00:00Z'),
          },
        ],
      }),
      PERIODO,
      AGORA,
    );
    const h2 = parcialDoHotel(
      hotel({
        hotelId: 'h2',
        fuso: 'Europe/Lisbon',
        uhsAtivas: 300,
        chamados: [
          chamado('b', '2026-10-02T00:00:00Z', {
            prazoSolucao: t('2026-10-03T00:00:00Z'),
            os: [concluida('o2', '2026-10-03T06:00:00Z')],
          }),
          chamado('c', '2026-10-02T00:00:00Z', {
            prazoSolucao: t('2026-10-04T00:00:00Z'),
            os: [concluida('o3', '2026-10-02T12:00:00Z')],
          }),
        ],
      }),
      PERIODO,
      AGORA,
    );
    const rede = indicadoresDaParcial(somarParciais([h1, h2]));
    expect(rede.hoteis).toBe(2);
    expect(rede.uhsAtivas).toBe(400);
    expect(rede.percentualDeSla).toBe(66.7);
    expect(rede.mttrHoras).toBe(17.3); // 10, 30 e 12 horas
    expect(rede.medianaHoras).toBe(12);
    expect(rede.chamadosPor100Uhs).toBe(0.8);
    expect(rede.uhDias).toBe(1);
    const dia2 = somarParciais([h1, h2]).serie.find((d) => d.dia === '2026-10-02');
    expect(dia2?.abertos).toBe(2); // h1 abre em 01/10 local; h2, em 02/10 em Lisboa
    // Em 02/10: o prazo de h1 (dentro) e as conclusões de 10 e 12 horas. Em
    // 03/10 em Lisboa: o prazo de h2 vencido antes da conclusão de 30 horas.
    const serie = somarParciais([h1, h2]).serie.map(indicadoresDoDia);
    expect(serie.find((d) => d.dia === '2026-10-02')).toMatchObject({
      percentualDeSla: 100,
      mttrHoras: 11,
    });
    expect(serie.find((d) => d.dia === '2026-10-03')).toMatchObject({
      percentualDeSla: 0,
      mttrHoras: 30,
    });
    expect(indicadoresDaParcial(somarParciais([])).percentualDeSla).toBeNull();
  });
});

describe('onde mais quebra (chamados por categoria)', () => {
  it('os abertos no período, sem os cancelados, pela categoria de agora, somados na rede', () => {
    const h1 = parcialDoHotel(
      hotel({
        chamados: [
          chamado('a', '2026-10-02T12:00:00Z', { categoriaId: 'elevador' }),
          chamado('b', '2026-10-03T12:00:00Z', { categoriaId: 'elevador' }),
          chamado('c', '2026-10-03T12:00:00Z', { categoriaId: 'ar' }),
          chamado('d', '2026-10-04T12:00:00Z'), // sem categoria
          chamado('e', '2026-10-04T12:00:00Z', { categoriaId: 'ar', estado: 'cancelado' }),
          chamado('f', '2026-09-20T12:00:00Z', { categoriaId: 'ar' }), // antes do período
        ],
      }),
      PERIODO,
      AGORA,
    );
    const h2 = parcialDoHotel(
      hotel({
        hotelId: 'h2',
        chamados: [chamado('g', '2026-10-05T12:00:00Z', { categoriaId: 'ar' })],
      }),
      PERIODO,
      AGORA,
    );
    expect(ondeMaisQuebra(somarParciais([h1, h2]))).toEqual({
      categorias: [
        { categoriaId: 'ar', chamados: 2 },
        { categoriaId: 'elevador', chamados: 2 },
        { categoriaId: null, chamados: 1 },
      ],
      outras: 0,
    });
  });

  it('as 8 primeiras, da maior para a menor, e o resto somado em "outras"', () => {
    const porCategoria = Array.from({ length: 10 }, (_, i) => ({
      categoriaId: `c${i}`,
      chamados: i + 1,
    }));
    const r = ondeMaisQuebra({
      porCategoria: [...porCategoria, { categoriaId: null, chamados: 0 }],
    });
    expect(r.categorias.map((c) => c.categoriaId)).toEqual([
      'c9',
      'c8',
      'c7',
      'c6',
      'c5',
      'c4',
      'c3',
      'c2',
    ]);
    expect(r.outras).toBe(3); // c1 e c0, com 2 e 1
  });
});

describe('quem vê o painel', () => {
  const atribuicao = (
    papel: Papel,
    escopo: Atribuicao['escopo'],
    extra: Partial<Atribuicao> = {},
  ): Atribuicao => ({
    id: 'a',
    usuarioId: 'u',
    papel,
    escopo,
    validoAte: null,
    revogadoEm: null,
    ...extra,
  });
  const H = { id: 'h1', bandeiraId: 'b1', doUsuarioComoProprietario: true };

  it('a gestão com escopo que cobre o hotel vê tudo', () => {
    expect(visaoDoHotel([atribuicao('admin_grupo', { tipo: 'grupo' })], H, AGORA)).toBe('completa');
    expect(
      visaoDoHotel([atribuicao('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b1' })], H, AGORA),
    ).toBe('completa');
    expect(
      visaoDoHotel([atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })], H, AGORA),
    ).toBeNull();
  });

  it('o proprietário do hotel vê só os cartões; o de outro hotel, nada', () => {
    expect(
      visaoDoHotel(
        [atribuicao('proprietario', { tipo: 'proprietario', proprietarioId: 'p1' })],
        H,
        AGORA,
      ),
    ).toBe('cartoes');
    expect(
      visaoDoHotel(
        [atribuicao('proprietario', { tipo: 'proprietario', proprietarioId: 'p1' })],
        { ...H, doUsuarioComoProprietario: false },
        AGORA,
      ),
    ).toBeNull();
  });

  it('o técnico, o solicitante, o implantador e a gestão revogada não veem', () => {
    for (const papel of ['tecnico', 'solicitante', 'implantador'] as const) {
      expect(
        visaoDoHotel([atribuicao(papel, { tipo: 'hotel', hotelId: 'h1' })], H, AGORA),
      ).toBeNull();
      const r = podeVerIndicadores([atribuicao(papel, { tipo: 'hotel', hotelId: 'h1' })], AGORA);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('indicadores_sem_permissao');
    }
    expect(
      visaoDoHotel([atribuicao('admin_grupo', { tipo: 'grupo' }, { revogadoEm: AGORA })], H, AGORA),
    ).toBeNull();
    expect(
      podeVerIndicadores(
        [atribuicao('proprietario', { tipo: 'proprietario', proprietarioId: 'p1' })],
        AGORA,
      ).permitido,
    ).toBe(true);
  });
});

describe('política da tolerância da preventiva (decisão 11)', () => {
  it('padrão 0, de 0 a 30 dias', () => {
    expect(resolverPolitica('preventiva.tolerancia_dias', {})).toEqual({ dias: 0 });
    expect(validarPolitica('preventiva.tolerancia_dias', { dias: 30 })).toEqual({ dias: 30 });
    for (const v of [{ dias: -1 }, { dias: 31 }, { dias: 1.5 }, { dias: 1, outro: 1 }, null]) {
      expect(() => validarPolitica('preventiva.tolerancia_dias', v)).toThrow();
    }
  });
});

describe('amostra mínima do destaque na comparação (Cesar, 15/10/2026)', () => {
  it('concorre com 10 itens ou mais', () => {
    expect([amostraSuficiente(9), amostraSuficiente(10), amostraSuficiente(25)]).toEqual([
      false,
      true,
      true,
    ]);
  });
});
