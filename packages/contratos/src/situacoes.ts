// Corretiva (fase 1a, C1; ADR-027): estados canônicos e ações do chamado e da
// OS, e as situações e prioridades do tenant. Repete as listas do domínio;
// tests/contratos-dominio confere. O formato fino (nomes, ordem, cor, peso) é
// validado no domínio, que devolve o código de cada campo.
import { z } from 'zod';
import { IDIOMAS_API } from './preferencias';

export const ESTADOS_DO_CHAMADO_API = [
  'aberto',
  'em_triagem',
  'em_execucao',
  'aguardando_aceite',
  'concluido',
  'cancelado',
] as const;
export const ESTADOS_DA_OS_API = [
  'atribuida',
  'em_execucao',
  'pausada',
  'concluida',
  'aceita',
  'cancelada',
] as const;
export const ACOES_DO_CHAMADO_API = ['triar', 'cancelar'] as const;
export const ACOES_DA_OS_API = [
  'gerar',
  'reatribuir',
  'iniciar',
  'pausar',
  'retomar',
  'concluir',
  'aceitar',
  'aceitar_automatico',
  'reabrir',
  'cancelar',
] as const;
export const ENTIDADES_COM_SITUACAO_API = ['chamado', 'os'] as const;
export const PRIORIDADES_PADRAO_API = ['urgente', 'alta', 'media', 'baixa'] as const;

const Nomes = z.partialRecord(z.enum(IDIOMAS_API), z.string().max(200));

export const SituacaoApi = z
  .object({
    id: z.guid(),
    entidade: z.enum(ENTIDADES_COM_SITUACAO_API),
    /** Estado canônico do chamado ou da OS, conforme a entidade. */
    estado: z.string(),
    /** Situação padrão do catálogo (nome em situacao.padrao.<chave>); nulo na do tenant. */
    chavePadrao: z.string().nullable(),
    nomes: Nomes,
    ordem: z.int(),
    cor: z.string(),
    ativa: z.boolean(),
  })
  .meta({ id: 'SituacaoApi' });

export const PrioridadeApi = z
  .object({
    id: z.guid(),
    /** Prioridade padrão do catálogo (nome em prioridade.padrao.<chave>); nulo na do tenant. */
    chavePadrao: z.string().nullable(),
    nomes: Nomes,
    ordem: z.int(),
    /** Peso para o SLA (1c): maior, mais urgente. */
    peso: z.int(),
    ativa: z.boolean(),
  })
  .meta({ id: 'PrioridadeApi' });

export const RespostaDeSituacoesEPrioridades = z
  .object({
    idiomaPadrao: z.enum(IDIOMAS_API),
    situacoes: z.array(SituacaoApi),
    prioridades: z.array(PrioridadeApi),
  })
  .meta({ id: 'RespostaDeSituacoesEPrioridades' });

export const PedidoDeSituacao = z
  .object({ nomes: Nomes, ordem: z.int(), cor: z.string().max(16) })
  .meta({ id: 'PedidoDeSituacao' });

/** A entidade e o estado só entram na criação: depois não mudam. */
export const PedidoDeSituacaoNova = PedidoDeSituacao.extend({
  entidade: z.enum(ENTIDADES_COM_SITUACAO_API),
  estado: z.string().max(40),
}).meta({ id: 'PedidoDeSituacaoNova' });

export const PedidoDePrioridade = z
  .object({ nomes: Nomes, ordem: z.int(), peso: z.int() })
  .meta({ id: 'PedidoDePrioridade' });

export const RespostaDeConfiguracaoAlterada = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeConfiguracaoAlterada' });

export const RespostaDeSituacoesEPrioridadesPadrao = z
  .object({ situacoes: z.int(), prioridades: z.int() })
  .meta({ id: 'RespostaDeSituacoesEPrioridadesPadrao' });
