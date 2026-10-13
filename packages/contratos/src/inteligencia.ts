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
    /** Chamados por semana, nas últimas 12 semanas, da mais antiga para a atual. */
    serie: z.array(z.object({ inicio: Data, quantidade: z.int() })),
    nomes: NomesDoPainelApi,
  })
  .meta({ id: 'RespostaDoInsight' });

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
    insights: z.array(InsightApi),
    nomes: NomesDoPainelApi,
  })
  .meta({ id: 'RespostaDoAtivoNoIntelligence' });
