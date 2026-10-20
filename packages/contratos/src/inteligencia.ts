// O painel do HubKeep Intelligence (as telas do 1.0): o resumo do menu, a
// lista de insights, a página do insight e a decisão. Repete as listas do
// @hubkeep/inteligencia, que este pacote não importa (o núcleo nunca importa
// o módulo, ADR-037); o teste da ligação no web confere que são as mesmas.
import { z } from 'zod';

export const TIPOS_DE_INSIGHT_API = ['atencao_ativo', 'sistemico'] as const;
export const ESTADOS_DO_INSIGHT_API = [
  'novo',
  'em_revisao',
  'aceito',
  'em_acao',
  'monitorando',
  'resolvido',
  'descartado',
] as const;
export const FILTROS_DE_ESTADO_DO_INSIGHT_API = [
  'abertos',
  'encerrados',
  ...ESTADOS_DO_INSIGHT_API,
] as const;
export const ACOES_DO_INSIGHT_API = [
  'revisar',
  'aceitar',
  'agir',
  'monitorar',
  'resolver',
  'descartar',
] as const;
export const MOTIVOS_DE_DESCARTE_API = ['nao_relevante', 'substituido'] as const;
/** As faixas dos scores (FAIXAS_PADRAO); o sistêmico entra na de atenção. */
export const FAIXAS_DO_INSIGHT_API = [
  'normal',
  'observar',
  'atencao',
  'alta_atencao',
  'critico',
] as const;

const Data = z.iso.datetime({ offset: true });

/** Os quatro indicadores da lista, sobre os abertos; também a contagem do menu. */
export const RespostaDoResumoDoIntelligence = z
  .object({
    abertos: z.int(),
    altaAtencaoOuCritico: z.int(),
    sistemicos: z.int(),
    semResponsavel: z.int(),
  })
  .meta({ id: 'RespostaDoResumoDoIntelligence' });

/** Os papéis que podem ver as telas: os que decidem insight (PAPEIS_DO_INSIGHT). */
export const PAPEIS_QUE_VEEM_AS_TELAS_API = ['admin_grupo', 'gestor_csc', 'gerente_hotel'] as const;

/**
 * Quando as telas abrem (inteligencia.visibilidade_telas; adendo ao ADR-035 de
 * 12/10/2026), para o Admin do grupo, também antes da abertura.
 */
export const RespostaDaAberturaDoIntelligence = z
  .object({
    config: z.object({
      aPartirDe: z.iso.date().nullable(),
      diasAposAtivacao: z.int().min(0),
      papeis: z.array(z.enum(PAPEIS_QUE_VEEM_AS_TELAS_API)).min(1),
    }),
    /** Nulo: sem data e sem contrato do módulo, não há de onde contar. */
    abertura: z
      .object({
        em: Data,
        /** O dia da abertura no fuso do grupo. */
        dia: z.iso.date(),
        origem: z.enum(['data', 'ativacao']),
        primeiraAtivacao: Data.nullable(),
      })
      .nullable(),
    abertas: z.boolean(),
  })
  .meta({ id: 'RespostaDaAberturaDoIntelligence' });

export const ConsultaDeInsights = z
  .object({
    /** Os abertos, sem o campo. */
    estado: z.enum(FILTROS_DE_ESTADO_DO_INSIGHT_API).optional(),
    tipo: z.enum(TIPOS_DE_INSIGHT_API).optional(),
    faixa: z.enum(FAIXAS_DO_INSIGHT_API).optional(),
    /** Os insights que incluem este hotel. */
    hotelId: z.guid().optional(),
  })
  .meta({ id: 'ConsultaDeInsights' });

export const InsightApi = z
  .object({
    id: z.guid(),
    /** Nulo no insight de rede. */
    hotelId: z.guid().nullable(),
    bandeiraId: z.guid().nullable(),
    hotelIds: z.array(z.guid()),
    tipo: z.enum(TIPOS_DE_INSIGHT_API),
    escopo: z.record(z.string(), z.string()),
    estado: z.enum(ESTADOS_DO_INSIGHT_API),
    faixa: z.string(),
    /** Nulo no sistêmico, que não tem score. */
    valor: z.int().nullable(),
    versaoScore: z.int(),
    anteriorId: z.guid().nullable(),
    primeiraDeteccaoEm: Data,
    ultimaDeteccaoEm: Data,
    responsavelId: z.guid().nullable(),
    encerradoEm: Data.nullable(),
    encerradoPor: z.guid().nullable(),
    nota: z.string().nullable(),
    motivoDeDescarte: z.enum(MOTIVOS_DE_DESCARTE_API).nullable(),
    versao: z.int(),
    /** O insight que este substitui (aberto enquanto o anterior estava aberto). */
    substitui: z.guid().nullable(),
    substituidoPor: z.guid().nullable(),
    /** Se quem pede decide este insight (o papel no escopo dele). */
    podeDecidir: z.boolean(),
  })
  .meta({ id: 'InsightApi' });

/** Os nomes que a tela mostra, só os que quem pede lê. */
export const NomesDoPainelApi = z
  .object({
    hoteis: z.record(z.guid(), z.string()),
    bandeiras: z.record(z.guid(), z.string()),
    pessoas: z.record(z.guid(), z.string()),
    ativos: z.record(z.guid(), z.string()),
  })
  .meta({ id: 'NomesDoPainelApi' });

export const RespostaDeInsights = z
  .object({ insights: z.array(InsightApi), nomes: NomesDoPainelApi })
  .meta({ id: 'RespostaDeInsights' });

export const ChamadoDoInsightApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    ativoId: z.guid().nullable(),
    abertoEm: Data,
    estado: z.string(),
    descricao: z.string(),
  })
  .meta({ id: 'ChamadoDoInsightApi' });

/** Os resultados da efetividade (`ResultadoEfetividade` do motor). */
export const RESULTADOS_DA_EFETIVIDADE_API = [
  'reducao_observada',
  'reducao_parcial',
  'sem_mudanca_relevante',
  'aumento_observado',
  'sem_base_de_comparacao',
  'janela_incompleta',
] as const;

/** As métricas antes e depois (`ChaveMetrica` do motor); o custo vem à parte, com a cobertura. */
export const METRICAS_DA_EFETIVIDADE_API = ['chamados', 'reaberturas', 'horas_paradas'] as const;

const CustoDoLadoApi = z.object({
  /** Em reais, das OS aceitas com o custo informado. */
  soma: z.number(),
  /** O X de "custo informado em X de Y OS". */
  informadas: z.int(),
  /** O Y. */
  aceitas: z.int(),
});

/**
 * Uma intervenção com o antes e depois (adendo ao ADR-033 de 15/10/2026): a OS
 * corretiva concluída com o código de solução na lista da política. É a
 * variação observada, nunca a causa.
 */
export const EfetividadeDaIntervencaoApi = z
  .object({
    intervencao: z.object({
      chamadoId: z.guid(),
      hotelId: z.guid(),
      bandeiraId: z.guid().nullable(),
      ativoId: z.guid(),
      /** A conclusão final da OS. */
      em: Data,
      codigoSolucaoId: z.guid(),
      executadoPor: z.string(),
      fornecedorId: z.guid().nullable(),
      fornecedorNome: z.string().nullable(),
      custoInformado: z.number().nullable(),
      descricao: z.string().nullable(),
    }),
    efetividade: z.object({
      versao: z.int(),
      resultado: z.enum(RESULTADOS_DA_EFETIVIDADE_API),
      diasDecorridos: z.int(),
      metricas: z.array(
        z.object({
          chave: z.enum(METRICAS_DA_EFETIVIDADE_API),
          antes: z.number(),
          depois: z.number(),
          variacaoPercentual: z.number().nullable(),
        }),
      ),
      /** Abaixo de 50% de cobertura num dos lados, `suficiente` é falso e não há variação. */
      custo: z.object({
        antes: CustoDoLadoApi,
        depois: CustoDoLadoApi,
        suficiente: z.boolean(),
        variacaoPercentual: z.number().nullable(),
      }),
      configuracao: z.object({
        janelaDias: z.int(),
        reducaoObservadaPercentual: z.number(),
        reducaoParcialPercentual: z.number(),
        aumentoObservadoPercentual: z.number(),
        minChamadosAntes: z.int(),
      }),
    }),
  })
  .meta({ id: 'EfetividadeDaIntervencaoApi' });

/** As intervenções, da mais recente para a mais antiga, com os nomes dos hotéis e dos ativos. */
export const RespostaDasEfetividades = z
  .object({ intervencoes: z.array(EfetividadeDaIntervencaoApi), nomes: NomesDoPainelApi })
  .meta({ id: 'RespostaDasEfetividades' });

export const PedidoDeDecisaoDoInsight = z
  .object({
    acao: z.enum(ACOES_DO_INSIGHT_API),
    /** A versão que a tela viu: outra pessoa decidiu antes, 409 conflito_de_versao. */
    versao: z.int().min(1),
    /** Obrigatória ao resolver e ao descartar (até 500 caracteres, conferido no domínio). */
    nota: z.string().max(2000).nullish(),
    /** Só ao descartar. */
    motivoDeDescarte: z.enum(MOTIVOS_DE_DESCARTE_API).nullish(),
  })
  .meta({ id: 'PedidoDeDecisaoDoInsight' });

export const RespostaDaDecisaoDoInsight = z
  .object({
    versao: z.int(),
    estado: z.enum(ESTADOS_DO_INSIGHT_API),
    responsavelId: z.guid(),
  })
  .meta({ id: 'RespostaDaDecisaoDoInsight' });

/** Uma linha da métrica diária do ativo, como o job gravou (ADR-036). */
export const MetricaDoAtivoApi = z
  .object({
    /** AAAA-MM-DD. */
    dia: z.iso.date(),
    calculo: z.int(),
    recalculo: z.boolean(),
    calculadoEm: Data,
    atencao: z.int().nullable(),
    faixa: z.string(),
    reincidencia: z.int().nullable(),
    versaoFormulaAtencao: z.int(),
    versaoFormulaReincidencia: z.int(),
    versaoPolitica: z.string(),
    /** O score da atenção: componentes, pesos, valores e a configuração (limite do insight). */
    detalheAtencao: z.unknown(),
    detalheReincidencia: z.unknown(),
  })
  .meta({ id: 'MetricaDoAtivoApi' });

/** Um recálculo do dia na página do ativo (ADR-036): o resumo, sem o detalhe. */
export const RecalculoDoAtivoApi = z
  .object({
    calculo: z.int(),
    calculadoEm: Data,
    atencao: z.int().nullable(),
    faixa: z.string(),
    reincidencia: z.int().nullable(),
    versaoFormulaAtencao: z.int(),
    versaoFormulaReincidencia: z.int(),
    versaoPolitica: z.string(),
  })
  .meta({ id: 'RecalculoDoAtivoApi' });

/**
 * "Procurar ativo" no Intelligence (16/10/2026): os ativos em uso do termo, só
 * dos hotéis em que quem pede decide insight, em ordem de nome, até 20.
 */
export const RespostaDaBuscaDeAtivosNoIntelligence = z
  .object({
    ativos: z.array(
      z.object({
        id: z.guid(),
        nome: z.string(),
        hotelId: z.guid(),
        bandeiraId: z.guid().nullable(),
      }),
    ),
    nomes: NomesDoPainelApi,
  })
  .meta({ id: 'RespostaDaBuscaDeAtivosNoIntelligence' });

/** Os estados do sinal de substituição (`SinalDeSubstituicao` do motor). */
export const SINAIS_DE_SUBSTITUICAO_API = [
  'sem_sinal',
  'observar',
  'avaliar_substituicao',
  'revisao_necessaria',
] as const;

/** Os critérios do sinal de substituição (`Criterio['chave']` do motor), na ordem do motor. */
export const CRITERIOS_DE_SUBSTITUICAO_API = [
  'corretivas12m',
  'horasParadas12m',
  'idadeAnos',
  'custoSobreReposicao',
  'impactoHospede',
  'criticidade',
  'reincidencia',
] as const;

/**
 * O sinal de substituição do ativo, calculado na leitura (proposta de
 * 16/10/2026, Cesar e Kaio). É sinal para análise: não registra decisão.
 */
export const SubstituicaoDoAtivoApi = z
  .object({
    versao: z.int(),
    sinal: z.enum(SINAIS_DE_SUBSTITUICAO_API),
    atingidos: z.int(),
    /** Os critérios com dado para avaliar. */
    avaliados: z.int(),
    /** Nulo sem a data da garantia. */
    garantiaVigente: z.boolean().nullable(),
    criterios: z.array(
      z.object({
        chave: z.enum(CRITERIOS_DE_SUBSTITUICAO_API),
        /** Nulo sem dado: o critério não foi avaliado. */
        valor: z.number().nullable(),
        limite: z.number(),
        atingido: z.boolean().nullable(),
      }),
    ),
    calculadoEm: Data,
  })
  .meta({ id: 'SubstituicaoDoAtivoApi' });

// O sinal do hóspede (ADR-047, a 1.5 sem IA): a importação por CSV e a fila
// de classificação. As listas repetem as do @hubkeep/inteligencia
// (sinal-hospede.ts); o teste da ligação no web confere que são as mesmas.

/** As colunas do CSV do HubKeep, na ordem do modelo. */
export const COLUNAS_DO_CSV_API = [
  'id_externo',
  'data',
  'fonte',
  'nota',
  'escala',
  'texto',
  'idioma',
  'uh',
] as const;
/** As colunas sem as quais o arquivo não serve. */
export const COLUNAS_OBRIGATORIAS_DO_CSV_API = ['id_externo', 'data', 'fonte'] as const;
/** O máximo de linhas de um arquivo (e de um pedido). */
export const LIMITE_DA_IMPORTACAO_API = 1000;
/**
 * O corpo do pedido de importação: acima do padrão (256 KB), porque cada
 * linha pode trazer até 4000 caracteres de texto; a tela manda o arquivo em
 * partes abaixo disso.
 */
export const LIMITE_BYTES_DA_IMPORTACAO = 1024 * 1024;
export const ERROS_DA_LINHA_API = [
  'id_externo_ausente',
  'id_externo_longo',
  'data_invalida',
  'data_no_futuro',
  'fonte_invalida',
  'nota_invalida',
  'escala_invalida',
  'sem_conteudo',
  'texto_longo',
  'idioma_invalido',
  'uh_longa',
  'repetida_no_arquivo',
] as const;
export const LIGACOES_DO_SINAL_API = ['sem_ligacao', 'possivel', 'confirmada'] as const;
export const SITUACOES_DA_FILA_API = ['pendentes', 'manutencao', 'fora', 'todas'] as const;

/** O texto de cada coluna como veio no arquivo; a validação é do Intelligence, por linha. */
const CelulaDoCsv = z.string().max(8000).optional();

export const PedidoDeImportacaoDeSinais = z
  .object({
    hotelId: z.guid(),
    /** Só as colunas do HubKeep: a tela não manda as outras (nome e contato do hóspede ficam fora). */
    linhas: z
      .array(
        z.strictObject(
          Object.fromEntries(COLUNAS_DO_CSV_API.map((c) => [c, CelulaDoCsv])) as Record<
            (typeof COLUNAS_DO_CSV_API)[number],
            typeof CelulaDoCsv
          >,
        ),
      )
      .min(1)
      .max(LIMITE_DA_IMPORTACAO_API),
  })
  .meta({ id: 'PedidoDeImportacaoDeSinais' });

export const RespostaDaImportacaoDeSinais = z
  .object({
    /** Nulo quando nenhuma linha era válida. */
    loteId: z.guid().nullable(),
    entraram: z.int(),
    repetidas: z.int(),
    erros: z.int(),
    /** Uma por linha do pedido; a linha 1 é a primeira do pedido, sem o cabeçalho. */
    linhas: z.array(
      z.discriminatedUnion('resultado', [
        z.object({ linha: z.int().min(1), resultado: z.enum(['entrou', 'repetida']) }),
        z.object({
          linha: z.int().min(1),
          resultado: z.literal('erro'),
          erro: z.enum(ERROS_DA_LINHA_API),
        }),
      ]),
    ),
  })
  .meta({ id: 'RespostaDaImportacaoDeSinais' });

export const ConsultaDaFilaDeSinais = z
  .object({
    hotelId: z.guid(),
    /** As sem classificação, sem o campo. */
    situacao: z.enum(SITUACOES_DA_FILA_API).optional(),
  })
  .meta({ id: 'ConsultaDaFilaDeSinais' });

export const SinalDaFilaApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    fonte: z.string(),
    idExterno: z.string(),
    ocorridoEm: Data,
    nota: z.number().nullable(),
    escala: z.int().nullable(),
    /** Nulo sem texto na importação ou depois do apagamento da retenção (textoApagadoEm). */
    texto: z.string().nullable(),
    textoApagadoEm: Data.nullable(),
    idioma: z.string().nullable(),
    uhCitada: z.string().nullable(),
    /** Nulo enquanto ninguém classificou. */
    manutencao: z.boolean().nullable(),
    categoriaId: z.guid().nullable(),
    uhId: z.guid().nullable(),
    ativoId: z.guid().nullable(),
    ligacao: z.enum(LIGACOES_DO_SINAL_API),
    classificadoEm: Data.nullable(),
    classificadoPor: z.guid().nullable(),
    importadoEm: Data,
    versao: z.int().min(1),
    /** O chamado aberto a partir da reclamação; nulo sem chamado. */
    chamadoId: z.guid().nullable(),
  })
  .meta({ id: 'SinalDaFilaApi' });

export const RespostaDaFilaDeSinais = z
  .object({
    sinais: z.array(SinalDaFilaApi),
    /** Há mais reclamações no recorte do que a fila mostra (até 200). */
    limitada: z.boolean(),
    nomes: z.object({
      ativos: z.record(z.string(), z.string()),
      pessoas: z.record(z.string(), z.string()),
    }),
  })
  .meta({ id: 'RespostaDaFilaDeSinais' });

export const PedidoDeClassificacaoDeSinal = z
  .object({
    /** A versão que a tela viu: outra pessoa classificou antes, 409 conflito_de_versao. */
    versao: z.int().min(1),
    manutencao: z.boolean(),
    categoriaId: z.guid().nullable(),
    uhId: z.guid().nullable(),
    ativoId: z.guid().nullable(),
    ligacao: z.enum(LIGACOES_DO_SINAL_API),
  })
  .meta({ id: 'PedidoDeClassificacaoDeSinal' });

export const RespostaDaClassificacaoDeSinal = z
  .object({ versao: z.int() })
  .meta({ id: 'RespostaDaClassificacaoDeSinal' });

// Abrir chamado a partir da reclamação (adendo de 19/10/2026 ao ADR-047): o
// chamado abre pelo caso de uso do núcleo, e a ligação vem depois.
export const PedidoDeChamadoDaReclamacao = z
  .object({
    /** Com o ativo da classificação; sem ele, o chamado abre na UH da classificação. */
    comAtivo: z.boolean(),
    /** A descrição do chamado, escrita pela pessoa (o texto do hóspede não vai junto). */
    descricao: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'PedidoDeChamadoDaReclamacao' });

export const RespostaDoChamadoDaReclamacao = z
  .object({ chamadoId: z.guid() })
  .meta({ id: 'RespostaDoChamadoDaReclamacao' });

// Um chamado para as reclamações do insight sistêmico (proposta de 19/10/2026,
// item 1): a pessoa escolhe o local, e as reclamações sem chamado são ligadas.
export const PedidoDeChamadoDoInsight = z
  .object({
    /** A UH ou a área comum do hotel do insight. */
    localId: z.guid(),
    ativoId: z.guid().nullable(),
    /** A descrição do chamado, escrita pela pessoa (o texto do hóspede não vai junto). */
    descricao: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'PedidoDeChamadoDoInsight' });

export const RespostaDoChamadoDoInsight = z
  .object({
    chamadoId: z.guid(),
    /** Quantas reclamações do insight foram ligadas ao chamado nesta chamada. */
    ligadas: z.int().min(0),
  })
  .meta({ id: 'RespostaDoChamadoDoInsight' });

export const PedidoDeLigacaoDoChamado = z
  .object({
    /** O chamado que quem pede abriu a partir da reclamação, quando a ligação falhou. */
    chamadoId: z.guid(),
  })
  .meta({ id: 'PedidoDeLigacaoDoChamado' });

// As reclamações nas páginas do insight e do ativo (C2 do ADR-047). As
// respostas das duas páginas ficam depois do sinal do hóspede, que elas usam.

/** Até 50, as mais recentes, que quem pede lê, com os nomes do ativo, de quem classificou e da UH. */
export const ReclamacoesDoPainelApi = z
  .object({
    sinais: z.array(SinalDaFilaApi),
    /** No insight, quantas a evidência tem (quem não lê o hotel vê só o total); no ativo, nulo. */
    total: z.int().nullable(),
    /** Há mais reclamações do que a lista mostra. */
    limitada: z.boolean(),
    /** No ativo, a janela da política do score, em dias; no insight, nulo. */
    janelaDias: z.int().nullable(),
    nomes: z.object({
      ativos: z.record(z.string(), z.string()),
      pessoas: z.record(z.string(), z.string()),
      uhs: z.record(z.string(), z.string()),
    }),
  })
  .meta({ id: 'ReclamacoesDoPainelApi' });

export const RespostaDoInsight = z
  .object({
    insight: InsightApi.extend({
      /** O score (componentes, pesos, valores) ou o sinal sistêmico, como o job gravou. */
      detalhe: z.unknown(),
      evidencia: z.unknown(),
      /** As ações que o estado permite; vazias para quem não decide. */
      acoes: z.array(z.enum(ACOES_DO_INSIGHT_API)),
    }),
    /** Os chamados da evidência que quem pede vê, do mais recente ao mais antigo. */
    chamados: z.array(ChamadoDoInsightApi),
    /** As reclamações da evidência do insight sistêmico das reclamações; nulo nos outros. */
    reclamacoes: ReclamacoesDoPainelApi.nullable(),
    /** Chamados por semana, nas últimas 12 semanas, da mais antiga para a atual. */
    serie: z.array(z.object({ inicio: Data, quantidade: z.int() })),
    nomes: NomesDoPainelApi,
    /** As intervenções nos ativos do insight concluídas depois da primeira detecção. */
    efetividade: RespostaDasEfetividades,
  })
  .meta({ id: 'RespostaDoInsight' });

/** O detalhe do ativo no Intelligence: a atenção dos últimos 90 dias e os insights do ativo. */
export const RespostaDoAtivoNoIntelligence = z
  .object({
    ativo: z.object({
      id: z.guid(),
      nome: z.string(),
      hotelId: z.guid(),
      bandeiraId: z.guid().nullable(),
      criticidade: z.int().nullable(),
      desativadoEm: Data.nullable(),
    }),
    /** O resultado original de cada dia gravado, em ordem de dia. */
    serie: z.array(z.object({ dia: z.iso.date(), atencao: z.int().nullable(), faixa: z.string() })),
    /** O último dia gravado, com o detalhe; nulo se o job ainda não gravou nenhum. */
    atual: MetricaDoAtivoApi.nullable(),
    /** Os recálculos do dia de `atual`, do primeiro ao último (até 20); a tela os mostra a pedido. */
    recalculos: z.array(RecalculoDoAtivoApi),
    insights: z.array(InsightApi),
    nomes: NomesDoPainelApi,
    /** As intervenções no ativo concluídas nos últimos 180 dias. */
    efetividade: RespostaDasEfetividades,
    /** O sinal de substituição, calculado agora; nulo para o ativo baixado. */
    substituicao: SubstituicaoDoAtivoApi.nullable(),
    /** As reclamações ligadas ao ativo na janela do Guest Impact Score (ADR-047). */
    reclamacoes: ReclamacoesDoPainelApi,
  })
  .meta({ id: 'RespostaDoAtivoNoIntelligence' });
