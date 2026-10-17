// A ligação do painel do Intelligence (as telas do 1.0), sem banco: as portas
// do motor sobre uma porta do packages/db em memória, com a forma das linhas
// do banco; e as listas da API iguais às do motor. Também o sinal do hóspede
// (ADR-047): a importação, a fila e a classificação pelo contrato da API.
import {
  ACOES_DO_INSIGHT_API,
  COLUNAS_DO_CSV_API,
  COLUNAS_OBRIGATORIAS_DO_CSV_API,
  ERROS_DA_LINHA_API,
  LIGACOES_DO_SINAL_API,
  LIMITE_DA_IMPORTACAO_API,
  RespostaDaFilaDeSinais,
  RespostaDaImportacaoDeSinais,
  SITUACOES_DA_FILA_API,
  ESTADOS_DO_INSIGHT_API,
  FAIXAS_DO_INSIGHT_API,
  FILTROS_DE_ESTADO_DO_INSIGHT_API,
  MOTIVOS_DE_DESCARTE_API,
  PAPEIS_QUE_VEEM_AS_TELAS_API,
  RespostaDaAberturaDoIntelligence,
  RespostaDaBuscaDeAtivosNoIntelligence,
  RespostaDoAtivoNoIntelligence,
  RespostaDoInsight,
  TIPOS_DE_INSIGHT_API,
} from '@hubkeep/contratos';
import type {
  ChamadoDaEfetividadeNoBanco,
  ClassificacaoNoBanco,
  DecisaoNoBanco,
  ImportacaoNoBanco,
  InsightComEvidenciaNoBanco,
  PortaDoPainelDoIntelligence,
  SinalDaFilaNoBanco,
} from '@hubkeep/db';
import type { EscopoDePolitica } from '@hubkeep/aplicacao';
import type { Atribuicao } from '@hubkeep/dominio';
import {
  ACOES_DO_INSIGHT,
  COLUNAS_DO_CSV,
  ERROS_DA_LINHA,
  LIGACOES_DO_SINAL,
  LIMITE_DA_IMPORTACAO,
  SITUACOES_DA_FILA,
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
  filaDeSinaisNaApi,
  insightNaApi,
  substituicaoNaApi,
} from '../src/app/api/v1/inteligencia/serializar';
import { criarPainel } from '../src/servidor/modulos/inteligencia/painel';

const agora = new Date('2026-10-10T12:00:00Z');
const H1 = '11100000-0000-0000-0000-000000000001';
const I1 = '22200000-0000-0000-0000-000000000001';
const U1 = '33300000-0000-0000-0000-000000000001';
const A1 = '55500000-0000-0000-0000-000000000001';
const S1 = '66600000-0000-0000-0000-000000000001';
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

const SINAL: SinalDaFilaNoBanco = {
  id: S1,
  hotelId: H1,
  fonte: 'google',
  idExterno: 'r-1',
  ocorridoEm: new Date('2026-10-08T12:00:00Z'),
  nota: 2.5,
  escala: 5,
  texto: 'Elevador parado de novo',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: null,
  manutencao: null,
  categoriaId: null,
  uhId: null,
  ativoId: null,
  ligacao: 'sem_ligacao',
  classificadoEm: null,
  classificadoPor: null,
  importadoEm: new Date('2026-10-09T10:00:00Z'),
  versao: 1,
};

function portaEmMemoria(insights: InsightComEvidenciaNoBanco[], sinais = [SINAL]) {
  const decisoes: DecisaoNoBanco[] = [];
  const buscas: { termo: string; limite: number }[] = [];
  const importacoes: ImportacaoNoBanco[] = [];
  const classificacoes: ClassificacaoNoBanco[] = [];
  const filas: { hotelId: string; situacao: string; limite: number }[] = [];
  const porta: PortaDoPainelDoIntelligence = {
    ativosPorBusca: async (_ctx, termo, limite) => {
      buscas.push({ termo, limite });
      return [{ id: A1, nome: 'Elevador social 2', hotelId: H1, bandeiraId: null }];
    },
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
            fuso: 'America/Sao_Paulo',
            dataCompra: '2014-06-01',
            garantiaAte: null,
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
    politicasDaSubstituicao: async () => [],
    intervencoes: async () => [TROCA],
    historicoDosAtivos: async () => ({ chamados: [TROCA], paradas: [] }),
    hotelDoSinal: async (_ctx, id) => (id === H1 ? { id: H1, bandeiraId: null } : null),
    gravarSinais: async (_ctx, i) => {
      importacoes.push(i);
      return {
        loteId: '77700000-0000-0000-0000-000000000001',
        inseridos: i.sinais.map((x) => `${x.fonte}|${x.idExterno}`),
      };
    },
    sinaisDoHotel: async (_ctx, hotelId, situacao, limite) => {
      filas.push({ hotelId, situacao, limite });
      return sinais;
    },
    sinalParaClassificar: async (_ctx, id) =>
      id === S1 ? { id: S1, hotelId: H1, bandeiraId: null, versao: 1 } : null,
    referenciasDaClassificacao: async () => ({ ativo: null, uh: null, categoria: null }),
    classificar: async (_ctx, c) => {
      classificacoes.push(c);
      return { versao: c.versaoEsperada + 1 };
    },
  };
  return { porta, decisoes, buscas, importacoes, classificacoes, filas };
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
  sinais: SinalDaFilaNoBanco[] = [SINAL],
) => {
  const { porta, decisoes, buscas, importacoes, classificacoes, filas } = portaEmMemoria(
    insights,
    sinais,
  );
  return {
    decisoes,
    buscas,
    importacoes,
    classificacoes,
    filas,
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

  it('as do sinal do hóspede: colunas, limite, erros da linha, ligações e recortes', () => {
    expect([...COLUNAS_DO_CSV_API]).toEqual([...COLUNAS_DO_CSV]);
    expect(
      COLUNAS_OBRIGATORIAS_DO_CSV_API.every((c) =>
        (COLUNAS_DO_CSV as readonly string[]).includes(c),
      ),
    ).toBe(true);
    expect(LIMITE_DA_IMPORTACAO_API).toBe(LIMITE_DA_IMPORTACAO);
    expect([...ERROS_DA_LINHA_API]).toEqual([...ERROS_DA_LINHA]);
    expect([...LIGACOES_DO_SINAL_API]).toEqual([...LIGACOES_DO_SINAL]);
    expect([...SITUACOES_DA_FILA_API]).toEqual([...SITUACOES_DA_FILA]);
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

  it('procurar ativo: o termo normalizado, o nome do hotel e o contrato da API', async () => {
    const { casos, buscas } = painel([linha()]);
    const r = RespostaDaBuscaDeAtivosNoIntelligence.parse(
      await casos.procurarAtivos(ctx, '  Elévador '),
    );
    expect(buscas).toEqual([{ termo: 'elevador', limite: 100 }]);
    expect(r.ativos.map((a) => a.id)).toEqual([A1]);
    expect(r.nomes.hoteis).toEqual({ [H1]: 'Hotel 1' });
    // Sem termo, nada é lido; abaixo de 3 letras, busca_curta.
    expect((await casos.procurarAtivos(ctx, null)).ativos).toEqual([]);
    expect(buscas).toHaveLength(1);
    await expect(casos.procurarAtivos(ctx, 'el')).rejects.toMatchObject({
      codigo: 'busca_curta',
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
      substituicao: substituicaoNaApi(
        (await casos.substituicaoDoAtivo(ctx, A1)) as NonNullable<
          Awaited<ReturnType<typeof casos.substituicaoDoAtivo>>
        >,
      ),
    });
    // O sinal de substituição, calculado agora: a idade pela data de compra (2014),
    // a reincidência do último dia gravado e o custo sobre a reposição sem dado.
    expect(resposta.substituicao).toMatchObject({ versao: 1, avaliados: 6 });
    expect(
      resposta.substituicao?.criterios
        .filter((c) => ['idadeAnos', 'reincidencia', 'custoSobreReposicao'].includes(c.chave))
        .map((c) => [c.chave, c.valor]),
    ).toEqual([
      ['idadeAnos', 12],
      ['custoSobreReposicao', null],
      ['reincidencia', 40],
    ]);
    expect('fuso' in resposta.ativo).toBe(false);
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
    // A OS da troca abriu antes da conclusão, mas fica fora de todas as métricas (versão 4).
    expect(doAtivo[0]?.efetividade).toMatchObject({
      versao: 4,
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

  it('a importação do sinal leva quem pede e passa pelo contrato da API', async () => {
    const { casos, importacoes } = painel([]);
    const r = RespostaDaImportacaoDeSinais.parse(
      await casos.importarSinais(ctx, H1, [
        { id_externo: 'r-1', data: '2026-10-08', fonte: 'Google', nota: '2,5', escala: '5' },
        { id_externo: 'r-2', data: '08/10/2026', fonte: 'google', texto: 'Chuveiro frio' },
      ]),
    );
    expect(r).toMatchObject({ entraram: 1, repetidas: 0, erros: 1 });
    expect(r.linhas[1]).toEqual({ linha: 2, resultado: 'erro', erro: 'data_invalida' });
    expect(importacoes).toHaveLength(1);
    expect(importacoes[0]).toMatchObject({ hotelId: H1, importadoPor: U1 });
    await expect(
      casos.importarSinais(ctx, '99900000-0000-0000-0000-000000000009', [{}]),
    ).rejects.toMatchObject({
      codigo: 'hotel_nao_encontrado',
    });
  });

  it('a fila do sinal: as sem classificação por padrão, pelo contrato da API', async () => {
    const { casos, filas } = painel([]);
    const fila = RespostaDaFilaDeSinais.parse(
      filaDeSinaisNaApi(await casos.filaDeSinais(ctx, H1, undefined)),
    );
    expect(filas).toEqual([{ hotelId: H1, situacao: 'pendentes', limite: 201 }]);
    expect(fila.sinais[0]).toMatchObject({
      id: S1,
      ocorridoEm: '2026-10-08T12:00:00.000Z',
      classificadoEm: null,
      ligacao: 'sem_ligacao',
    });
    await casos.filaDeSinais(ctx, H1, 'todas');
    expect(filas[1]?.situacao).toBe('todas');
  });

  it('a classificação do sinal leva quem pede', async () => {
    const { casos, classificacoes } = painel([]);
    expect(
      await casos.classificarSinal(ctx, S1, {
        versao: 1,
        manutencao: false,
        categoriaId: null,
        uhId: null,
        ativoId: null,
        ligacao: 'sem_ligacao',
      }),
    ).toEqual({ versao: 2 });
    expect(classificacoes[0]).toMatchObject({
      sinalId: S1,
      classificadoPor: U1,
      manutencao: false,
    });
  });

  it('ligação do sinal fora da lista do motor é defeito, não dado', async () => {
    const { casos } = painel(
      [],
      true,
      COM_O_GERENTE,
      [gerente],
      [{ ...SINAL, ligacao: 'inventada' }],
    );
    await expect(casos.filaDeSinais(ctx, H1, 'todas')).rejects.toThrow(
      'Ligação do sinal desconhecida',
    );
  });

  it('linha do banco fora das listas do motor é defeito, não dado', async () => {
    await expect(painel([linha({ estado: 'inventado' })]).casos.ver(ctx, I1)).rejects.toThrow(
      'Estado de insight desconhecido',
    );
  });
});
