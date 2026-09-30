// Chamados (fase 1a, C2) e triagem (C3). A abertura leva o local, o ativo
// opcional e a descrição; a prioridade padrão e a situação inicial são
// resolvidas no servidor, e a foto vai depois, como anexo do chamado. A
// triagem e as ações da OS levam a versão vista (ADR-029). Os limites finos
// (descrição, motivo, ativo no local, UH pendente, quem recebe a OS) são
// validados no domínio, com código.
import { z } from 'zod';
import { ESTADOS_DA_OS_API, ESTADOS_DO_CHAMADO_API } from './situacoes';

const versao = z.number().int().min(1);

export const PedidoDeAberturaDeChamado = z
  .object({
    localId: z.guid(),
    ativoId: z.guid().nullish(),
    descricao: z.string().max(4000),
    /** Equipamento parado desde (C5): grava a parada aberta do ativo; exige o ativo. */
    paradoDesde: z.iso.datetime().nullish(),
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
    criadoPor: z.guid(),
    versao: z.int(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'OsApi' });

export const RespostaDeChamado = z
  .object({
    chamado: ChamadoApi,
    /** As OS do chamado, da mais antiga para a mais nova (no máximo uma não cancelada). */
    os: z.array(OsApi),
  })
  .meta({ id: 'RespostaDeChamado' });

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

export const RespostaDeChamadoAlterado = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDeChamadoAlterado' });

export const RespostaDeOsGravada = z
  .object({ id: z.guid(), versao: z.int(), versaoDoChamado: z.int().optional() })
  .meta({ id: 'RespostaDeOsGravada' });

/** Aceitar a OS concluída (C6): só a versão vista da OS. */
export const PedidoDeAceiteDeOs = z.object({ versao }).meta({ id: 'PedidoDeAceiteDeOs' });

/** Reabrir a OS concluída (C6): o motivo é normalizado no domínio (até 500). */
export const PedidoDeReaberturaDeOs = z
  .object({ versao, motivo: z.string().max(2000) })
  .meta({ id: 'PedidoDeReaberturaDeOs' });

/** Uma OS da fila do dia do Técnico (C4), com o que a tela precisa do chamado. */
export const OsDoDiaApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    estado: z.enum(ESTADOS_DA_OS_API),
    situacaoId: z.guid(),
    responsavel: ResponsavelApi,
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
    }),
  })
  .meta({ id: 'OsDoDiaApi' });
export type OsDoDiaApi = z.infer<typeof OsDoDiaApi>;

export const RespostaDeOsDoDia = z
  .object({ os: z.array(OsDoDiaApi) })
  .meta({ id: 'RespostaDeOsDoDia' });
