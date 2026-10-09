// Chamados (fase 1a, C2) e triagem (C3). A abertura leva o local, o ativo
// opcional e a descrição; a prioridade padrão e a situação inicial são
// resolvidas no servidor, e a foto vai depois, como anexo do chamado. A
// triagem e as ações da OS levam a versão vista (ADR-029). Os limites finos
// (descrição, motivo, ativo no local, UH pendente, quem recebe a OS) são
// validados no domínio, com código. Na I4, a abertura responde se afeta
// hóspede e se a UH ficou indisponível; a OS guarda quem executa (equipe
// interna ou fornecedor do grupo) e o custo informado no aceite.
import { z } from 'zod';
import { ESTADOS_DA_OS_API, ESTADOS_DO_CHAMADO_API } from './situacoes';

const versao = z.number().int().min(1);

/** De onde veio o trabalho (I4); o teste contratos × domínio confere com ORIGENS_DO_CHAMADO. */
export const ORIGENS_DO_CHAMADO_API = ['interno'] as const;

/** Quem executa a OS (I4); o teste contratos × domínio confere com EXECUTORES_DA_OS. */
export const EXECUTORES_DA_OS_API = ['equipe_interna', 'fornecedor'] as const;

export const PedidoDeAberturaDeChamado = z
  .object({
    localId: z.guid(),
    ativoId: z.guid().nullish(),
    descricao: z.string().max(4000),
    /** Equipamento parado desde (C5): grava a parada aberta do ativo; exige o ativo. */
    paradoDesde: z.iso.datetime().nullish(),
    /** Afeta hóspede? (I4) null ou ausente: não sei. */
    impactoHospede: z.boolean().nullish(),
    /** A UH indisponível desde (I4): grava o período aberto da UH; só em chamado de UH. */
    uhIndisponivelDesde: z.iso.datetime().nullish(),
  })
  .meta({ id: 'PedidoDeAberturaDeChamado' });

export const RespostaDeChamadoAberto = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDeChamadoAberto' });

export const ChamadoApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    localId: z.guid(),
    ativoId: z.guid().nullable(),
    descricao: z.string(),
    estado: z.enum(ESTADOS_DO_CHAMADO_API),
    situacaoId: z.guid(),
    prioridadeId: z.guid(),
    /** Cópia da política aplicada na abertura (ADR-026), por chave. */
    politicaAplicada: z.record(z.string(), z.unknown()),
    abertoPor: z.guid(),
    motivoCancelamento: z.string().nullable(),
    /** De onde veio o trabalho (I4). */
    origem: z.enum(ORIGENS_DO_CHAMADO_API),
    /** Afeta hóspede? null: não informado (I4). */
    impactoHospede: z.boolean().nullable(),
    versao: z.int(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'ChamadoApi' });

/** A OS vai para um Técnico do hotel ou para uma equipe do hotel (A6). */
export const ResponsavelApi = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('tecnico'), usuarioId: z.guid() }),
    z.object({ tipo: z.literal('equipe'), equipeId: z.guid() }),
  ])
  .meta({ id: 'ResponsavelApi' });

export const OsApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    chamadoId: z.guid(),
    estado: z.enum(ESTADOS_DA_OS_API),
    situacaoId: z.guid(),
    responsavel: ResponsavelApi,
    motivoCancelamento: z.string().nullable(),
    /** O último motivo de reabertura (C6); o histórico fica na auditoria. */
    motivoReabertura: z.string().nullable(),
    /** Quem executa (I4): a equipe interna ou o fornecedor do grupo. */
    executadoPor: z.enum(EXECUTORES_DA_OS_API),
    /** O fornecedor, só quando executada por fornecedor. */
    fornecedorId: z.guid().nullable(),
    /** O custo informado no aceite, em reais (I4); null: não informado. */
    custoInformado: z.number().nullable(),
    criadoPor: z.guid(),
    versao: z.int(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'OsApi' });

/** Os nomes que o detalhe mostra no lugar dos ids (C7); o que quem pede não lê vem null ou fica de fora. */
export const NomesDoChamadoApi = z
  .object({
    hotel: z.string().nullable(),
    local: z.string().nullable(),
    ativo: z.string().nullable(),
    /** Quem abriu e os Técnicos das OS, por usuário. */
    pessoas: z.record(z.guid(), z.string()),
    /** As equipes das OS, por id. */
    equipes: z.record(z.guid(), z.string()),
  })
  .meta({ id: 'NomesDoChamadoApi' });

export const RespostaDeChamado = z
  .object({
    chamado: ChamadoApi,
    /** As OS do chamado, da mais antiga para a mais nova (no máximo uma não cancelada). */
    os: z.array(OsApi),
    nomes: NomesDoChamadoApi,
  })
  .meta({ id: 'RespostaDeChamado' });

/**
 * Filtros das listas de chamados e de OS (C7), na query string. O período é
 * pela data de criação: de (inclusive) até ate (exclusive), em ISO 8601. A
 * prioridade da OS é a do chamado. depoisDe é o `proximo` da página anterior.
 */
export const ConsultaDaLista = z
  .object({
    hotelId: z.guid().optional(),
    situacaoId: z.guid().optional(),
    prioridadeId: z.guid().optional(),
    de: z.iso.datetime({ offset: true }).optional(),
    ate: z.iso.datetime({ offset: true }).optional(),
    depoisDe: z.guid().optional(),
  })
  .meta({ id: 'ConsultaDaLista' });

export const ChamadoResumidoApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    hotelNome: z.string().nullable(),
    localId: z.guid(),
    localNome: z.string().nullable(),
    ativoId: z.guid().nullable(),
    ativoNome: z.string().nullable(),
    descricao: z.string(),
    estado: z.enum(ESTADOS_DO_CHAMADO_API),
    situacaoId: z.guid(),
    prioridadeId: z.guid(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'ChamadoResumidoApi' });

export const RespostaDeListaDeChamados = z
  .object({
    /** Do mais novo para o mais antigo, até 50 por página. */
    chamados: z.array(ChamadoResumidoApi),
    /** Para a página seguinte (depoisDe); null na última. */
    proximo: z.guid().nullable(),
  })
  .meta({ id: 'RespostaDeListaDeChamados' });

export const OsResumidaApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    hotelNome: z.string().nullable(),
    chamadoId: z.guid(),
    localNome: z.string().nullable(),
    /** Do chamado; null se quem pede lê a OS e não o chamado. */
    descricao: z.string().nullable(),
    prioridadeId: z.guid().nullable(),
    estado: z.enum(ESTADOS_DA_OS_API),
    situacaoId: z.guid(),
    responsavel: ResponsavelApi,
    responsavelNome: z.string().nullable(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'OsResumidaApi' });

export const RespostaDeListaDeOs = z
  .object({
    /** Da mais nova para a mais antiga, até 50 por página. */
    os: z.array(OsResumidaApi),
    proximo: z.guid().nullable(),
  })
  .meta({ id: 'RespostaDeListaDeOs' });

/** As entidades da auditoria que formam a linha do tempo do chamado (C7). */
export const ENTIDADES_DA_LINHA_DO_TEMPO_API = [
  'chamado',
  'os',
  'parada_ativo',
  'uh_indisponivel',
] as const;

/** Uma ação da auditoria do chamado, das OS dele ou das paradas do chamado (C7). */
export const EventoDaLinhaDoTempoApi = z
  .object({
    id: z.guid(),
    em: z.iso.datetime(),
    entidade: z.enum(ENTIDADES_DA_LINHA_DO_TEMPO_API),
    registroId: z.guid(),
    /** A ação gravada na auditoria (ex.: abrir, gerar, concluir, reabrir); o nome sai do catálogo. */
    acao: z.string(),
    usuarioId: z.guid().nullable(),
    usuarioNome: z.string().nullable(),
    /** O motivo do cancelamento ou da reabertura. */
    motivo: z.string().nullable(),
  })
  .meta({ id: 'EventoDaLinhaDoTempoApi' });

export const RespostaDeLinhaDoTempo = z
  .object({
    /** Da mais antiga para a mais nova. */
    eventos: z.array(EventoDaLinhaDoTempoApi),
  })
  .meta({ id: 'RespostaDeLinhaDoTempo' });

export const PedidoDeTriagem = z
  .object({ versao, prioridadeId: z.guid().nullish() })
  .meta({ id: 'PedidoDeTriagem' });

export const PedidoDeAjusteDePrioridade = z
  .object({ versao, prioridadeId: z.guid() })
  .meta({ id: 'PedidoDeAjusteDePrioridade' });

/** Cancelar o chamado ou a OS: o motivo é normalizado no domínio (até 500). */
export const PedidoDeCancelamento = z
  .object({ versao, motivo: z.string().max(2000) })
  .meta({ id: 'PedidoDeCancelamento' });

export const PedidoDeAtribuicaoDeOs = z
  .object({ versao, responsavel: ResponsavelApi })
  .meta({ id: 'PedidoDeAtribuicaoDeOs' });

/**
 * Gerar a OS (C3), com quem executa (I4): sem executadoPor, a equipe interna.
 * O fornecedor é exigido quando quem executa é fornecedor (domínio).
 */
export const PedidoDeGeracaoDeOs = PedidoDeAtribuicaoDeOs.extend({
  executadoPor: z.enum(EXECUTORES_DA_OS_API).optional(),
  fornecedorId: z.guid().nullish(),
}).meta({ id: 'PedidoDeGeracaoDeOs' });

/** Corrigir quem executa a OS, até a conclusão (I4). */
export const PedidoDeExecutorDaOs = z
  .object({
    versao,
    executadoPor: z.enum(EXECUTORES_DA_OS_API),
    fornecedorId: z.guid().nullish(),
  })
  .meta({ id: 'PedidoDeExecutorDaOs' });

/** Corrigir o impacto no hóspede, até o aceite (I4); null: não sei. */
export const PedidoDeImpactoNoHospede = z
  .object({ versao, impactoHospede: z.boolean().nullable() })
  .meta({ id: 'PedidoDeImpactoNoHospede' });

export const RespostaDeChamadoAlterado = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDeChamadoAlterado' });

export const RespostaDeOsGravada = z
  .object({ id: z.guid(), versao: z.int(), versaoDoChamado: z.int().optional() })
  .meta({ id: 'RespostaDeOsGravada' });

/**
 * Aceitar a OS concluída (C6): a versão vista da OS e, opcional, o custo
 * informado em reais (I4), conferido no domínio (não negativo, dois decimais).
 */
export const PedidoDeAceiteDeOs = z
  .object({ versao, custoInformado: z.number().nullish() })
  .meta({ id: 'PedidoDeAceiteDeOs' });

/**
 * Reabrir a OS concluída (C6): o motivo é normalizado no domínio (até 500).
 * Com paradoDesde, o equipamento está parado: abre a parada do ativo no
 * mesmo chamado (a encerrada não reabre).
 */
export const PedidoDeReaberturaDeOs = z
  .object({ versao, motivo: z.string().max(2000), paradoDesde: z.iso.datetime().nullish() })
  .meta({ id: 'PedidoDeReaberturaDeOs' });

/** A OS reaberta; paradaId nulo sem parada nova (não pedida, ou o ativo já estava parado). */
export const RespostaDeReaberturaDeOs = RespostaDeOsGravada.extend({
  paradaId: z.guid().nullable(),
}).meta({ id: 'RespostaDeReaberturaDeOs' });

/** Uma OS da fila do dia do Técnico (C4), com o que a tela precisa do chamado. */
export const OsDoDiaApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    estado: z.enum(ESTADOS_DA_OS_API),
    situacaoId: z.guid(),
    responsavel: ResponsavelApi,
    /** O último motivo de reabertura (C6), para o técnico ver por que voltou. */
    motivoReabertura: z.string().nullable(),
    versao: z.int(),
    criadoEm: z.iso.datetime(),
    chamado: z.object({
      id: z.guid(),
      descricao: z.string(),
      localId: z.guid(),
      localNome: z.string(),
      prioridadeId: z.guid(),
      estado: z.enum(ESTADOS_DO_CHAMADO_API),
      /** O ativo do chamado (C5); sem ele, não há parada. */
      ativoId: z.guid().nullable(),
      /** Início da parada aberta do ativo (C5); null se não está parado. */
      paradoDesde: z.iso.datetime().nullable(),
      /** A parada aberta é deste chamado: a OS encerra, e a conclusão pergunta se voltou. */
      paradaDoChamado: z.boolean(),
      /** Início do período aberto da UH do chamado (I4): a conclusão pergunta se foi liberada. */
      uhIndisponivelDesde: z.iso.datetime().nullable(),
    }),
  })
  .meta({ id: 'OsDoDiaApi' });
export type OsDoDiaApi = z.infer<typeof OsDoDiaApi>;

export const RespostaDeOsDoDia = z
  .object({ os: z.array(OsDoDiaApi) })
  .meta({ id: 'RespostaDeOsDoDia' });
