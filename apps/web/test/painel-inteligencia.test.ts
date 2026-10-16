// A ligação do painel do Intelligence (as telas do 1.0), sem banco: as portas
// do motor sobre uma porta do packages/db em memória, com a forma das linhas
// do banco; e as listas da API iguais às do motor.
import {
  ACOES_DO_INSIGHT_API,
  ESTADOS_DO_INSIGHT_API,
  FAIXAS_DO_INSIGHT_API,
  FILTROS_DE_ESTADO_DO_INSIGHT_API,
  MOTIVOS_DE_DESCARTE_API,
  PAPEIS_QUE_VEEM_AS_TELAS_API,
  RespostaDaAberturaDoIntelligence,
  RespostaDoAtivoNoIntelligence,
  RespostaDoInsight,
  TIPOS_DE_INSIGHT_API,
} from '@hubkeep/contratos';
import type {
  ChamadoDaEfetividadeNoBanco,
  DecisaoNoBanco,
  InsightComEvidenciaNoBanco,
  PortaDoPainelDoIntelligence,
} from '@hubkeep/db';
import type { EscopoDePolitica } from '@hubkeep/aplicacao';
import type { Atribuicao } from '@hubkeep/dominio';
import {
  ACOES_DO_INSIGHT,
  ESTADOS_DO_INSIGHT,
  FAIXAS_PADRAO,
  FILTROS_DE_ESTADO_DO_INSIGHT,
  MOTIVOS_DE_DESCARTE,
  PAPEIS_DO_INSIGHT,
  TIPOS_DE_INSIGHT,
} from '@hubkeep/inteligencia';
import { describe, expect, it } from 'vitest';
import {
  dataNaApi,
  efetividadesNaApi,
  insightNaApi,
} from '../src/app/api/v1/inteligencia/serializar';
import { criarPainel } from '../src/servidor/modulos/inteligencia/painel';

const agora = new Date('2026-10-10T12:00:00Z');
const H1 = '11100000-0000-0000-0000-000000000001';
const I1 = '22200000-0000-0000-0000-000000000001';
const U1 = '33300000-0000-0000-0000-000000000001';
const A1 = '55500000-0000-0000-0000-000000000001';
const ctx = { usuarioId: U1, tenantId: '44400000-0000-0000-0000-000000000001' };

const gerente: Atribuicao = {
  id: 'a1',
  usuarioId: U1,
  papel: 'gerente_hotel',
  escopo: { tipo: 'hotel', hotelId: H1 },
  validoAte: null,
  revogadoEm: null,
};

const linha = (extra: Partial<InsightComEvidenciaNoBanco> = {}): InsightComEvidenciaNoBanco => ({
  id: I1,
  hotelId: H1,
  bandeiraId: null,
  hotelIds: [H1],
  tipo: 'atencao_ativo',
  escopo: { ativoId: 'a', hotelId: H1 },
  estado: 'novo',
  faixa: 'alta_atencao',
  valor: 75,
  versaoScore: 2,
  anteriorId: null,
  primeiraDeteccaoEm: new Date('2026-10-01T00:00:00Z'),
  ultimaDeteccaoEm: new Date('2026-10-09T00:00:00Z'),
  responsavelId: null,
  encerradoEm: null,
  encerradoPor: null,
  nota: null,
  motivoDeDescarte: null,
  versao: 1,
  detalhe: { chave: 'atencao_ativo' },
  evidencia: { corretivaIds: [] },
  ...extra,
});

/** A troca do equipamento do elevador, como o banco a devolve. */
const TROCA: ChamadoDaEfetividadeNoBanco = {
  id: '66600000-0000-0000-0000-000000000001',
  hotelId: H1,
  bandeiraId: null,
  localId: '77700000-0000-0000-0000-000000000001',
  ativoId: A1,
  abertaEm: new Date('2026-09-01T00:00:00Z'),
  estado: 'concluido',
  impactoHospede: null,
  descricao: 'Modernização do elevador',
  os: [
    {
      estado: 'aceita',
      criadaEm: new Date('2026-09-01T00:00:00Z'),
      codigoFalha: null,
      codigoSolucaoId: '88800000-0000-0000-0000-000000000001',
      codigoSolucaoChave: 'solucao_troca_do_equipamento',
      executadoPor: 'fornecedor',
      fornecedorId: null,
      fornecedorNome: 'Elevadores Sul',
      custoInformado: 48000,
      transicoes: [
        { acao: 'concluir', para: 'concluida', quando: new Date('2026-09-05T00:00:00Z') },
        { acao: 'aceitar', para: 'aceita', quando: new Date('2026-09-06T00:00:00Z') },
      ],
    },
  ],
};

function portaEmMemoria(insights: InsightComEvidenciaNoBanco[]) {
  const decisoes: DecisaoNoBanco[] = [];
  const porta: PortaDoPainelDoIntelligence = {
    contagens: async () => [
      { tipo: 'atencao_ativo', faixa: 'critico', comResponsavel: false, quantidade: 2 },
    ],
    insights: async () => insights,
    insight: async (_ctx, id) => insights.find((i) => i.id === id) ?? null,
    ligados: async () => [],
    chamados: async () => [],
    nomes: async () => ({ hoteis: { [H1]: 'Hotel 1' }, bandeiras: {}, pessoas: {}, ativos: {} }),
    decidir: async (_ctx, d) => {
      decisoes.push(d);
      return { versao: d.versaoEsperada + 1 };
    },
    ativo: async (_ctx, id) =>
      id === A1
        ? {
            id: A1,
            nome: 'Elevador social 2',
            hotelId: H1,
            bandeiraId: null,
            criticidade: 5,
            desativadoEm: null,
          }
        : null,
    metricasDoAtivo: async () => [
      {
        dia: '2026-10-10',
        calculo: 1,
        recalculo: false,
        calculadoEm: new Date('2026-10-10T03:00:00Z'),
        atencao: 75,
        faixa: 'alta_atencao',
        reincidencia: 40,
        versaoFormulaAtencao: 2,
        versaoFormulaReincidencia: 1,
        versaoPolitica: 'padrao',
        detalheAtencao: { chave: 'atencao_ativo' },
        detalheReincidencia: { chave: 'reincidencia' },
      },
    ],
    insightsDoEscopo: async () => insights,
    politicasDaEfetividade: async () => [],
    intervencoes: async () => [TROCA],
    historicoDosAtivos: async () => ({ chamados: [TROCA], paradas: [] }),
  };
  return { porta, decisoes };
}

/** As políticas gravadas no grupo: por padrão, a visibilidade com o Gerente, já aberta. */
const COM_O_GERENTE = [
  {
    chave: 'inteligencia.visibilidade_telas',
    escopo: { tipo: 'grupo' as const },
    valor: {
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    },
  },
];

const painel = (
  insights: InsightComEvidenciaNoBanco[],
  modulos = true,
  politicas: { chave: string; escopo: EscopoDePolitica; valor: unknown }[] = COM_O_GERENTE,
  atribuicoes: Atribuicao[] = [gerente],
) => {
  const { porta, decisoes } = portaEmMemoria(insights);
  return {
    decisoes,
    casos: criarPainel({
      porta,
      modulos: {
        contratados: async () =>
          modulos
            ? [{ modulo: 'inteligencia', inicio: new Date('2026-01-01T00:00:00Z'), fim: null }]
            : [],
      },
      atribuicoes: { doUsuario: async () => atribuicoes },
      configuracao: { politicas: async () => politicas },
      relogio: { agora: () => agora },
    }),
  };
};

describe('as listas da API são as do motor', () => {
  it('tipos, estados, filtros, ações, motivos e faixas', () => {
    expect([...TIPOS_DE_INSIGHT_API]).toEqual([...TIPOS_DE_INSIGHT]);
    expect([...ESTADOS_DO_INSIGHT_API]).toEqual([...ESTADOS_DO_INSIGHT]);
    expect([...FILTROS_DE_ESTADO_DO_INSIGHT_API]).toEqual([...FILTROS_DE_ESTADO_DO_INSIGHT]);
    expect([...ACOES_DO_INSIGHT_API]).toEqual([...ACOES_DO_INSIGHT]);
    expect([...MOTIVOS_DE_DESCARTE_API]).toEqual([...MOTIVOS_DE_DESCARTE]);
    expect([...FAIXAS_DO_INSIGHT_API]).toEqual(FAIXAS_PADRAO.map((f) => f.chave));
  });
});

describe('a visibilidade das telas sobre as políticas do grupo', () => {
  const admin: Atribuicao = {
    ...gerente,
    id: 'a9',
    papel: 'admin_grupo',
    escopo: { tipo: 'grupo' },
  };

  it('os papéis da API são os que decidem insight', () => {
    expect([...PAPEIS_QUE_VEEM_AS_TELAS_API]).toEqual([...PAPEIS_DO_INSIGHT]);
  });

  it('sem política gravada vale o padrão: o Gerente não vê', async () => {
    await expect(painel([], true, []).casos.resumo(ctx)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });

  it('a política gravada num hotel não vale: só a do grupo', async () => {
    const noHotel = COM_O_GERENTE.map((p) => ({
      ...p,
      escopo: { tipo: 'hotel' as const, hotelId: H1 },
    }));
    await expect(painel([], true, noHotel).casos.resumo(ctx)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });

  it('a abertura para o Admin passa pelo contrato da API', async () => {
    const r = await painel([], true, [], [admin]).casos.abertura(ctx);
    const corpo = {
      ...r,
      abertura: r.abertura && {
        ...r.abertura,
        em: dataNaApi(r.abertura.em),
        primeiraAtivacao: r.abertura.primeiraAtivacao && dataNaApi(r.abertura.primeiraAtivacao),
      },
    };
    expect(RespostaDaAberturaDoIntelligence.parse(corpo)).toMatchObject({
      abertas: true,
      abertura: { dia: '2026-03-01', origem: 'ativacao' },
    });
    await expect(painel([]).casos.abertura(ctx)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });
});

describe('o painel sobre a porta do banco', () => {
  it('sem o módulo: inteligencia_indisponivel', async () => {
    await expect(painel([linha()], false).casos.resumo(ctx)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });

  it('o resumo pelas contagens do banco', async () => {
    expect(await painel([linha()]).casos.resumo(ctx)).toEqual({
      abertos: 2,
      altaAtencaoOuCritico: 2,
      sistemicos: 0,
      semResponsavel: 2,
    });
  });

  it('a página passa pelo contrato da API', async () => {
    const { casos } = painel([linha()]);
    const p = await casos.ver(ctx, I1);
    // A troca concluída em 05/09 é anterior à primeira detecção (01/10): fica fora (opção a).
    const efetividade = await casos.efetividadeDoInsight(ctx, I1);
    expect(efetividade.intervencoes).toEqual([]);
    const resposta = {
      insight: insightNaApi(p.insight),
      chamados: [],
      serie: p.serie.map((s) => ({ inicio: dataNaApi(s.inicio), quantidade: s.quantidade })),
      nomes: p.nomes,
      efetividade: efetividadesNaApi(efetividade),
    };
    expect(RespostaDoInsight.parse(resposta).insight).toMatchObject({
      id: I1,
      primeiraDeteccaoEm: '2026-10-01T00:00:00.000Z',
      encerradoEm: null,
      acoes: ['revisar', 'aceitar', 'descartar'],
      podeDecidir: true,
    });
  });

  it('o detalhe do ativo passa pelo contrato da API', async () => {
    const { casos } = painel([linha()]);
    const p = await casos.ativo(ctx, A1);
    const resposta = RespostaDoAtivoNoIntelligence.parse({
      ativo: { ...p.ativo, desativadoEm: null },
      serie: p.serie,
      atual: p.atual && { ...p.atual, calculadoEm: dataNaApi(p.atual.calculadoEm) },
      insights: p.insights.map(insightNaApi),
      nomes: p.nomes,
      efetividade: efetividadesNaApi(await casos.efetividadeDoAtivo(ctx, A1)),
    });
    expect(resposta.efetividade.intervencoes[0]?.intervencao).toMatchObject({
      em: '2026-09-05T00:00:00.000Z',
      descricao: 'Modernização do elevador',
      fornecedorNome: 'Elevadores Sul',
    });
    expect(resposta.serie).toEqual([{ dia: '2026-10-10', atencao: 75, faixa: 'alta_atencao' }]);
    expect(resposta.atual).toMatchObject({ calculadoEm: '2026-10-10T03:00:00.000Z', calculo: 1 });
    expect(resposta.insights.map((i) => i.id)).toEqual([I1]);
  });

  it('a efetividade do ativo e a da seção da lista, pelas linhas do banco', async () => {
    const { casos } = painel([linha()]);
    const { intervencoes: doAtivo } = await casos.efetividadeDoAtivo(ctx, A1);
    expect(doAtivo.map((e) => [e.intervencao.chamadoId, e.intervencao.em])).toEqual([
      [TROCA.id, new Date('2026-09-05T00:00:00Z')],
    ]);
    // A OS da troca abriu antes da conclusão e conta como chamado antes; o custo dela fica fora.
    expect(doAtivo[0]?.efetividade).toMatchObject({
      versao: 3,
      resultado: 'sem_base_de_comparacao',
      custo: { antes: { aceitas: 0 }, depois: { aceitas: 0 }, suficiente: true },
    });
    const lista = await casos.efetividades(ctx);
    expect(lista.intervencoes.map((e) => e.intervencao.ativoId)).toEqual([A1]);
    expect(lista.nomes.hoteis).toEqual({ [H1]: 'Hotel 1' });
  });

  it('a decisão leva o usuário do contexto como responsável', async () => {
    const { casos, decisoes } = painel([linha()]);
    expect(await casos.decidir(ctx, I1, { acao: 'aceitar', versao: 1 })).toEqual({
      versao: 2,
      estado: 'aceito',
      responsavelId: U1,
    });
    expect(decisoes[0]).toMatchObject({ acao: 'aceitar', responsavelId: U1, encerradoPor: null });
  });

  it('linha do banco fora das listas do motor é defeito, não dado', async () => {
    await expect(painel([linha({ estado: 'inventado' })]).casos.ver(ctx, I1)).rejects.toThrow(
      'Estado de insight desconhecido',
    );
  });
});
