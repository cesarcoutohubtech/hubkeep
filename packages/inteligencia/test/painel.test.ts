import type { Atribuicao, Escopo, ModuloContratado, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  PADRAO_VISIBILIDADE_TELAS,
  aberturaDoPainel,
  type DecisaoGravada,
  type InsightComEvidencia,
  type AtivoDoPainel,
  type InsightLigado,
  type MetricaDoPainel,
  type PortasDoPainel,
  acoesDoEstado,
  chamadosDaEvidencia,
  explicacaoDoSinal,
  decidirInsight,
  listarInsights,
  responsavelDepoisDaAcao,
  resumoDoPainel,
  serieSemanal,
  substitui,
  verAtivo,
  verInsight,
} from '../src/index';

const DIA = 86_400_000;
const agora = new Date('2026-10-10T12:00:00Z');
const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);

const atribuicao = (papel: Papel, escopo: Escopo, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
  ...extra,
});

const MODULO: ModuloContratado = { modulo: 'inteligencia', inicio: antes(100), fim: null };

const insight = (extra: Partial<InsightComEvidencia> = {}): InsightComEvidencia => ({
  id: 'i1',
  hotelId: 'h1',
  bandeiraId: 'b1',
  hotelIds: ['h1'],
  tipo: 'atencao_ativo',
  escopo: { ativoId: 'a1', hotelId: 'h1' },
  estado: 'novo',
  faixa: 'alta_atencao',
  valor: 75,
  versaoScore: 2,
  anteriorId: null,
  primeiraDeteccaoEm: antes(5),
  ultimaDeteccaoEm: antes(1),
  responsavelId: null,
  encerradoEm: null,
  encerradoPor: null,
  nota: null,
  motivoDeDescarte: null,
  versao: 1,
  detalhe: { chave: 'atencao_ativo' },
  evidencia: { corretivaIds: ['c1', 'c2', 'c3'] },
  ...extra,
});

interface Memoria {
  modulos: ModuloContratado[];
  /** O valor gravado no grupo; nos testes antigos, os três papéis e já aberto. */
  visibilidade: unknown;
  atribuicoes: Atribuicao[];
  insights: InsightComEvidencia[];
  chamados: { id: string; hotelId: string; abertoEm: Date }[];
  decisoes: DecisaoGravada[];
  filtros: unknown[];
  ativos: AtivoDoPainel[];
  metricas: (MetricaDoPainel & { ativoId: string })[];
  recalculos: (MetricaDoPainel & { ativoId: string })[];
  desdes: string[];
}

function emMemoria(m: Partial<Memoria> = {}): PortasDoPainel & { m: Memoria } {
  const mem: Memoria = {
    modulos: [MODULO],
    visibilidade: {
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    },
    atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    insights: [insight()],
    chamados: [],
    decisoes: [],
    filtros: [],
    ativos: [
      {
        id: 'a1',
        nome: 'Elevador social 2',
        hotelId: 'h1',
        bandeiraId: 'b1',
        criticidade: 5,
        desativadoEm: null,
        fuso: 'America/Sao_Paulo',
        dataCompra: null,
        garantiaAte: null,
      },
    ],
    metricas: [],
    recalculos: [],
    desdes: [],
    ...m,
  };
  return {
    m: mem,
    modulos: async () => mem.modulos,
    atribuicoes: async () => mem.atribuicoes,
    visibilidade: async () => mem.visibilidade,
    fuso: async () => 'America/Sao_Paulo',
    contagens: async (estados) => {
      const abertos = mem.insights.filter((i) => estados.includes(i.estado));
      return abertos.map((i) => ({
        tipo: i.tipo,
        faixa: i.faixa,
        comResponsavel: i.responsavelId !== null,
        quantidade: 1,
      }));
    },
    insights: async (filtro) => {
      mem.filtros.push(filtro);
      return mem.insights.filter((i) => filtro.estados.includes(i.estado));
    },
    insight: async (id) => mem.insights.find((i) => i.id === id) ?? null,
    ligados: async (ids) =>
      mem.insights
        .filter((i) => ids.includes(i.id) || (i.anteriorId !== null && ids.includes(i.anteriorId)))
        .flatMap((i) => [i, ...mem.insights.filter((x) => x.id === i.anteriorId)])
        .map((i): InsightLigado => ({
          id: i.id,
          anteriorId: i.anteriorId,
          abertoEm: i.primeiraDeteccaoEm,
          encerradoEm: i.encerradoEm,
        })),
    chamados: async (ids) =>
      mem.chamados
        .filter((c) => ids.includes(c.id))
        .map((c) => ({ ...c, ativoId: 'a1', estado: 'concluido', descricao: 'Pinga' })),
    nomes: async (p) => ({
      hoteis: Object.fromEntries(p.hotelIds.map((h) => [h, `Hotel ${h}`])),
      bandeiras: Object.fromEntries(p.bandeiraIds.map((b) => [b, `Bandeira ${b}`])),
      pessoas: Object.fromEntries(p.usuarioIds.map((u) => [u, `Pessoa ${u}`])),
      ativos: Object.fromEntries(p.ativoIds.map((a) => [a, `Ativo ${a}`])),
    }),
    decidir: async (d) => {
      mem.decisoes.push(d);
      return { versao: d.versaoEsperada + 1 };
    },
    ativo: async (id) => mem.ativos.find((a) => a.id === id) ?? null,
    metricasDoAtivo: async (ativoId, desde) => {
      mem.desdes.push(desde);
      return mem.metricas.filter((x) => x.ativoId === ativoId && x.dia >= desde);
    },
    recalculosDoDia: async (ativoId, dia) =>
      mem.recalculos.filter((x) => x.ativoId === ativoId && x.dia === dia),
    insightsDoEscopo: async (tipo, chave, valor) =>
      mem.insights.filter((i) => i.tipo === tipo && i.escopo[chave] === valor),
  };
}

const metrica = (dia: string, atencao: number | null): MetricaDoPainel & { ativoId: string } => ({
  ativoId: 'a1',
  dia,
  calculo: 1,
  recalculo: false,
  calculadoEm: new Date(`${dia}T03:00:00Z`),
  atencao,
  faixa: atencao === null ? 'dados_insuficientes' : atencao >= 70 ? 'alta_atencao' : 'atencao',
  reincidencia: 40,
  versaoFormulaAtencao: 2,
  versaoFormulaReincidencia: 1,
  versaoPolitica: 'padrao',
  detalheAtencao: { chave: 'atencao_ativo', valor: atencao },
  detalheReincidencia: { chave: 'reincidencia' },
});

describe('o painel só existe com o módulo e com papel que decide', () => {
  it.each([
    ['sem o módulo', { modulos: [] }],
    ['com o módulo vencido', { modulos: [{ ...MODULO, fim: antes(1) }] }],
    [
      'com papel que não decide',
      { atribuicoes: [atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' })] },
    ],
    [
      'com o papel vencido',
      {
        atribuicoes: [
          atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' }, { validoAte: antes(1) }),
        ],
      },
    ],
  ] as [string, Partial<Memoria>][])('%s: inteligencia_indisponivel', async (_nome, m) => {
    const p = emMemoria(m);
    await expect(resumoDoPainel(p, agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
    await expect(listarInsights(p, {}, agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
    await expect(verInsight(p, 'i1', agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });
});

describe('visibilidade das telas (adendo ao ADR-035, 12/10/2026)', () => {
  const gestor = atribuicao('gestor_csc', { tipo: 'grupo' });
  const admin = atribuicao('admin_grupo', { tipo: 'grupo' });
  const gerente = atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' });
  const indisponivel = { codigo: 'inteligencia_indisponivel' };

  it('com o padrão, antes dos 60 dias: ninguém vê, nem o Admin do grupo', async () => {
    const recente: ModuloContratado = { modulo: 'inteligencia', inicio: antes(59), fim: null };
    for (const a of [admin, gestor, gerente]) {
      const p = emMemoria({ modulos: [recente], atribuicoes: [a], visibilidade: undefined });
      await expect(resumoDoPainel(p, agora)).rejects.toMatchObject(indisponivel);
      await expect(listarInsights(p, {}, agora)).rejects.toMatchObject(indisponivel);
      await expect(verInsight(p, 'i1', agora)).rejects.toMatchObject(indisponivel);
      await expect(verAtivo(p, 'a1', agora)).rejects.toMatchObject(indisponivel);
    }
  });

  it('com o padrão, depois dos 60 dias: o Admin e o Gestor veem; o Gerente não', async () => {
    for (const a of [admin, gestor]) {
      const p = emMemoria({ atribuicoes: [a], visibilidade: undefined });
      expect((await resumoDoPainel(p, agora)).abertos).toBe(1);
    }
    const p = emMemoria({ atribuicoes: [gerente], visibilidade: undefined });
    await expect(resumoDoPainel(p, agora)).rejects.toMatchObject(indisponivel);
  });

  it('conta do primeiro contrato, mesmo encerrado, e não do vigente', async () => {
    const p = emMemoria({
      atribuicoes: [gestor],
      visibilidade: undefined,
      modulos: [
        { modulo: 'inteligencia', inicio: antes(200), fim: antes(150) },
        { modulo: 'inteligencia', inicio: antes(10), fim: null },
      ],
    });
    expect((await resumoDoPainel(p, agora)).abertos).toBe(1);
  });

  it('o Admin antecipa pela data; o Gerente entra só pela política', async () => {
    const recente: ModuloContratado = { modulo: 'inteligencia', inicio: antes(5), fim: null };
    const visibilidade = {
      ...PADRAO_VISIBILIDADE_TELAS,
      aPartirDe: '2026-10-10',
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    };
    const p = emMemoria({ modulos: [recente], atribuicoes: [gerente], visibilidade });
    expect((await listarInsights(p, {}, agora)).insights.map((i) => i.id)).toEqual(['i1']);
    // A data ainda não chegou no fuso: 10/10 às 02:59 UTC é 09/10 em Brasília.
    await expect(resumoDoPainel(p, new Date('2026-10-10T02:59:00Z'))).rejects.toMatchObject(
      indisponivel,
    );
  });

  it('quem tem também um papel fora da política decide só pelos papéis dela', async () => {
    const gestorDaOutraBandeira = atribuicao('gestor_csc', { tipo: 'bandeira', bandeiraId: 'b9' });
    const p = emMemoria({ atribuicoes: [gestorDaOutraBandeira, gerente], visibilidade: undefined });
    const pagina = await verInsight(p, 'i1', agora);
    expect([pagina.insight.podeDecidir, pagina.insight.acoes]).toEqual([false, []]);
    await expect(
      decidirInsight(p, { insightId: 'i1', acao: 'revisar', versao: 1, usuarioId: 'u1' }, agora),
    ).rejects.toMatchObject({ codigo: 'insight_fora_do_escopo' });
  });

  it('aberturaDoPainel: só o Admin do grupo, também antes da abertura', async () => {
    const recente: ModuloContratado = { modulo: 'inteligencia', inicio: antes(5), fim: null };
    const p = emMemoria({ modulos: [recente], atribuicoes: [admin], visibilidade: undefined });
    const r = await aberturaDoPainel(p, agora);
    expect(r.abertas).toBe(false);
    expect(r.config).toBe(PADRAO_VISIBILIDADE_TELAS);
    expect(r.abertura?.origem).toBe('ativacao');
    // Ativado em 05/10/2026 (Brasília): abre 60 dias depois, em 04/12.
    expect(r.abertura?.dia).toBe('2026-12-04');
    for (const m of [
      { atribuicoes: [gestor] },
      { atribuicoes: [admin], modulos: [] },
    ] as Partial<Memoria>[]) {
      await expect(aberturaDoPainel(emMemoria(m), agora)).rejects.toMatchObject(indisponivel);
    }
  });
});

describe('resumo', () => {
  it('conta os abertos, os em alta atenção ou crítico, os sistêmicos e os sem responsável', async () => {
    const p = emMemoria({
      insights: [
        insight({ id: 'a', faixa: 'critico' }),
        insight({ id: 'b', faixa: 'atencao', responsavelId: 'u2' }),
        insight({ id: 'c', tipo: 'sistemico', faixa: 'atencao', valor: null, estado: 'aceito' }),
        insight({ id: 'd', estado: 'resolvido', encerradoEm: antes(1), encerradoPor: 'u1' }),
      ],
    });
    expect(await resumoDoPainel(p, agora)).toEqual({
      abertos: 3,
      altaAtencaoOuCritico: 1,
      sistemicos: 1,
      semResponsavel: 2,
    });
  });
});

describe('lista', () => {
  it('abertos por padrão; encerrados e um estado pelo filtro', async () => {
    const p = emMemoria();
    await listarInsights(p, {}, agora);
    await listarInsights(p, { estado: 'encerrados', tipo: 'sistemico', faixa: 'atencao' }, agora);
    await listarInsights(p, { estado: 'aceito', hotelId: 'h1' }, agora);
    expect(p.m.filtros).toEqual([
      { estados: ['novo', 'em_revisao', 'aceito', 'em_acao', 'monitorando'] },
      { estados: ['resolvido', 'descartado'], tipo: 'sistemico', faixa: 'atencao' },
      { estados: ['aceito'], hotelId: 'h1' },
    ]);
  });

  it('a substituição nos dois sentidos, quem decide e os nomes', async () => {
    const velho = insight({
      id: 'velho',
      hotelId: null,
      hotelIds: ['h1', 'h2'],
      tipo: 'sistemico',
    });
    const novo = insight({
      id: 'novo',
      hotelId: null,
      hotelIds: ['h1', 'h2', 'h3'],
      tipo: 'sistemico',
      anteriorId: 'velho',
      primeiraDeteccaoEm: antes(2),
      responsavelId: 'u9',
    });
    const p = emMemoria({ insights: [velho, novo, insight()] });
    const { insights, nomes } = await listarInsights(p, {}, agora);
    expect(insights.map((i) => [i.id, i.substitui, i.substituidoPor, i.podeDecidir])).toEqual([
      // O gerente não decide insight de rede.
      ['velho', null, 'novo', false],
      ['novo', 'velho', null, false],
      ['i1', null, null, true],
    ]);
    expect(nomes.hoteis).toEqual({ h1: 'Hotel h1', h2: 'Hotel h2', h3: 'Hotel h3' });
    expect(nomes.pessoas).toEqual({ u9: 'Pessoa u9' });
    expect(nomes.ativos).toEqual({ a1: 'Ativo a1' });
  });

  it('o que abriu depois do encerramento do anterior é recorrência, não substituição', () => {
    expect(
      substitui({ anteriorId: 'v', primeiraDeteccaoEm: antes(1) }, [
        { id: 'v', anteriorId: null, abertoEm: antes(30), encerradoEm: antes(10) },
      ]),
    ).toBeNull();
    expect(
      substitui({ anteriorId: 'v', primeiraDeteccaoEm: antes(20) }, [
        { id: 'v', anteriorId: null, abertoEm: antes(30), encerradoEm: antes(10) },
      ]),
    ).toBe('v');
  });
});

describe('página do insight', () => {
  it('as ações do estado para quem decide, os chamados visíveis e a série de 12 semanas', async () => {
    const p = emMemoria({
      // c3 é de um hotel que quem lê não vê: a porta não o devolve.
      chamados: [
        { id: 'c1', hotelId: 'h1', abertoEm: antes(3) },
        { id: 'c2', hotelId: 'h1', abertoEm: antes(40) },
      ],
    });
    const pagina = await verInsight(p, 'i1', agora);
    expect(pagina.insight.acoes).toEqual(['revisar', 'aceitar', 'descartar']);
    expect(pagina.chamados.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(pagina.serie).toHaveLength(12);
    expect(pagina.serie.reduce((s, x) => s + x.quantidade, 0)).toBe(2);
    expect(pagina.serie[11]?.quantidade).toBe(1);
    expect(pagina.nomes.hoteis).toEqual({ h1: 'Hotel h1' });
  });

  it('quem lê e não decide vê a página sem ações', async () => {
    const rede = insight({ hotelId: null, hotelIds: ['h1', 'h2'], tipo: 'sistemico' });
    const p = emMemoria({ insights: [rede] });
    const pagina = await verInsight(p, 'i1', agora);
    expect([pagina.insight.podeDecidir, pagina.insight.acoes]).toEqual([false, []]);
  });

  it('insight que não existe (ou que a RLS esconde): insight_nao_encontrado', async () => {
    await expect(verInsight(emMemoria(), 'outro', agora)).rejects.toMatchObject({
      codigo: 'insight_nao_encontrado',
    });
  });
});

describe('decisão', () => {
  it('a primeira ação faz de quem decide o responsável', async () => {
    const p = emMemoria();
    const r = await decidirInsight(
      p,
      { insightId: 'i1', acao: 'revisar', versao: 1, usuarioId: 'u1' },
      agora,
    );
    expect(r).toEqual({ versao: 2, estado: 'em_revisao', responsavelId: 'u1' });
    expect(p.m.decisoes).toEqual([
      {
        insightId: 'i1',
        acao: 'revisar',
        versaoEsperada: 1,
        estado: 'em_revisao',
        nota: null,
        motivoDeDescarte: null,
        responsavelId: 'u1',
        encerradoEm: null,
        encerradoPor: null,
        em: agora,
      },
    ]);
  });

  it('descartar encerra, com o motivo e a nota, e mantém o responsável', async () => {
    const p = emMemoria({
      insights: [insight({ estado: 'aceito', responsavelId: 'u7', versao: 4 })],
    });
    await decidirInsight(
      p,
      {
        insightId: 'i1',
        acao: 'descartar',
        versao: 4,
        nota: '  Ruído do sensor  ',
        motivoDeDescarte: 'nao_relevante',
        usuarioId: 'u1',
      },
      agora,
    );
    expect(p.m.decisoes[0]).toMatchObject({
      estado: 'descartado',
      nota: 'Ruído do sensor',
      motivoDeDescarte: 'nao_relevante',
      responsavelId: 'u7',
      encerradoEm: agora,
      encerradoPor: 'u1',
    });
  });

  it('versão diferente da que a tela viu: conflito_de_versao, sem gravar', async () => {
    const p = emMemoria();
    await expect(
      decidirInsight(p, { insightId: 'i1', acao: 'revisar', versao: 3, usuarioId: 'u1' }, agora),
    ).rejects.toMatchObject({ codigo: 'conflito_de_versao' });
    expect(p.m.decisoes).toEqual([]);
  });

  it('as regras de decidirNoInsight valem: fora do escopo, transição inválida, nota', async () => {
    const rede = emMemoria({ insights: [insight({ hotelId: null, hotelIds: ['h1', 'h2'] })] });
    await expect(
      decidirInsight(rede, { insightId: 'i1', acao: 'revisar', versao: 1, usuarioId: 'u1' }, agora),
    ).rejects.toMatchObject({ codigo: 'insight_fora_do_escopo' });
    await expect(
      decidirInsight(
        emMemoria(),
        { insightId: 'i1', acao: 'agir', versao: 1, usuarioId: 'u1' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'transicao_invalida' });
    await expect(
      decidirInsight(
        emMemoria({ insights: [insight({ estado: 'aceito' })] }),
        { insightId: 'i1', acao: 'resolver', versao: 1, usuarioId: 'u1' },
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'motivo_obrigatorio' });
  });
});

describe('peças puras', () => {
  it('as ações de cada estado', () => {
    expect(acoesDoEstado('aceito')).toEqual(['agir', 'resolver', 'descartar']);
    expect(acoesDoEstado('resolvido')).toEqual([]);
  });

  it('o responsável é quem já era, ou quem age primeiro', () => {
    expect(responsavelDepoisDaAcao(null, 'u1')).toBe('u1');
    expect(responsavelDepoisDaAcao('u2', 'u1')).toBe('u2');
  });

  it('os chamados da evidência, só os ids em texto', () => {
    expect(chamadosDaEvidencia({ corretivaIds: ['c1', 2, 'c3'] })).toEqual(['c1', 'c3']);
    expect(chamadosDaEvidencia(null)).toEqual([]);
    expect(chamadosDaEvidencia({ regra: 'x' })).toEqual([]);
  });

  it('a série conta só dentro das 12 semanas', () => {
    const serie = serieSemanal([antes(0), antes(6), antes(7.5), antes(83), antes(85)], agora);
    // antes(85) fica fora; antes(83) cai na primeira semana; agora, na última.
    expect(serie.map((s) => s.quantidade)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
    expect(serie[0]?.inicio).toEqual(antes(84));
  });
});

describe('detalhe do ativo', () => {
  it('a série dos últimos 90 dias, o último dia com o detalhe e os insights do ativo', async () => {
    const p = emMemoria({
      metricas: [metrica('2026-10-08', 60), metrica('2026-10-09', null), metrica('2026-10-10', 75)],
      insights: [insight(), insight({ id: 'outro', escopo: { ativoId: 'a2', hotelId: 'h1' } })],
    });
    const pagina = await verAtivo(p, 'a1', agora);
    expect(p.m.desdes).toEqual(['2026-07-13']);
    expect(pagina.serie).toEqual([
      { dia: '2026-10-08', atencao: 60, faixa: 'atencao' },
      { dia: '2026-10-09', atencao: null, faixa: 'dados_insuficientes' },
      { dia: '2026-10-10', atencao: 75, faixa: 'alta_atencao' },
    ]);
    expect(pagina.atual).toMatchObject({ dia: '2026-10-10', calculo: 1, versaoPolitica: 'padrao' });
    expect(pagina.insights.map((i) => [i.id, i.podeDecidir])).toEqual([['i1', true]]);
    expect(pagina.nomes.hoteis).toEqual({ h1: 'Hotel h1' });
  });

  it('sem nenhum dia gravado, a página existe sem resultado', async () => {
    const pagina = await verAtivo(emMemoria({ insights: [] }), 'a1', agora);
    expect([pagina.serie, pagina.atual, pagina.insights, pagina.recalculos]).toEqual([
      [],
      null,
      [],
      [],
    ]);
  });

  it('os recálculos do último dia vêm à parte, e o resultado de cima segue o original', async () => {
    const recalculo = (calculo: number) => ({
      ...metrica('2026-10-10', 50 + calculo),
      calculo,
      recalculo: true,
    });
    const p = emMemoria({
      metricas: [metrica('2026-10-09', 60), metrica('2026-10-10', 75)],
      recalculos: [recalculo(2), recalculo(3), { ...recalculo(2), dia: '2026-10-09' }],
    });
    const pagina = await verAtivo(p, 'a1', agora);
    expect(pagina.atual).toMatchObject({ dia: '2026-10-10', calculo: 1, recalculo: false });
    expect(pagina.recalculos.map((r) => [r.dia, r.calculo, r.atencao])).toEqual([
      ['2026-10-10', 2, 52],
      ['2026-10-10', 3, 53],
    ]);
  });

  it('no dia que o job nunca gravou, o primeiro recálculo é o resultado e sai da lista', async () => {
    const recalculo = (calculo: number) => ({
      ...metrica('2026-10-10', 50 + calculo),
      calculo,
      recalculo: true,
    });
    const p = emMemoria({
      metricas: [metrica('2026-10-09', 60), recalculo(1)],
      recalculos: [recalculo(1), recalculo(2)],
    });
    const pagina = await verAtivo(p, 'a1', agora);
    expect(pagina.atual).toMatchObject({ calculo: 1, recalculo: true });
    expect(pagina.recalculos.map((r) => r.calculo)).toEqual([2]);
  });

  it('quem não decide o insight do hotel do ativo não vê a página', async () => {
    const deOutroHotel = emMemoria({
      atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })],
    });
    await expect(verAtivo(deOutroHotel, 'a1', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    await expect(verAtivo(emMemoria(), 'nao-existe', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    await expect(verAtivo(emMemoria({ modulos: [] }), 'a1', agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });
});

describe('a evidência do sinal sistêmico para o catálogo', () => {
  const evidencia = {
    quantidade: 9,
    distintos: 4,
    janelaDias: 90,
    hotelIds: ['h1', 'h2', 'h3'],
    corretivaIds: [],
    ativosDoModelo: 12,
    taxaPorAtivo: 2.25,
    basePorAtivo: 0.5,
  };
  it('o mesmo modelo, com a população e as taxas', () => {
    expect(explicacaoDoSinal({ regra: 'mesmo_modelo', evidencia })).toEqual({
      chave: 'inteligencia.sistemico.evidencia.mesmo_modelo',
      valores: {
        quantidade: 9,
        hoteis: 3,
        janelaDias: 90,
        distintos: 4,
        populacao: 12,
        taxa: 2.25,
        base: 0.5,
      },
    });
  });
  it('as outras regras, a frase genérica', () => {
    expect(explicacaoDoSinal({ regra: 'mesmo_andar', evidencia })).toEqual({
      chave: 'inteligencia.sistemico.evidencia.generica',
      valores: { quantidade: 9, hoteis: 3, janelaDias: 90 },
    });
  });
});
