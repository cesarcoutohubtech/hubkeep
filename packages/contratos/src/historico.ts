// Histórico de um registro (fase 1a, D1): quem mudou, o quê, quando, e o antes
// e o depois de cada campo, de hotel, local, ativo, chamado e OS. A ação e o
// campo são códigos, com o nome no catálogo; os valores são dados. Os ids que
// aparecem nos valores vêm com o nome em `referencias`, quando quem pede os lê.
import { z } from 'zod';

export const ENTIDADES_COM_HISTORICO_API = ['hotel', 'local', 'ativo', 'chamado', 'os'] as const;

export const ConsultaDoHistorico = z
  .object({
    entidade: z.enum(ENTIDADES_COM_HISTORICO_API),
    registroId: z.guid(),
  })
  .meta({ id: 'ConsultaDoHistorico' });

const ValorAuditadoApi = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const MudancaAuditadaApi = z
  .object({
    /** O campo no domínio (ex.: estado, prioridadeId, nome); o nome sai do catálogo. */
    campo: z.string(),
    /** A chave dentro do campo, quando ele é um objeto (o campo estendido do ativo). */
    chave: z.string().nullable(),
    antes: ValorAuditadoApi,
    depois: ValorAuditadoApi,
  })
  .meta({ id: 'MudancaAuditadaApi' });

export const EventoDoHistoricoApi = z
  .object({
    id: z.guid(),
    em: z.iso.datetime(),
    /** A ação gravada na auditoria (ex.: criar, alterar, triar); o nome sai do catálogo. */
    acao: z.string(),
    usuarioId: z.guid().nullable(),
    /** null se quem pede não lê o membro (o proprietário) ou se foi um job. */
    usuarioNome: z.string().nullable(),
    mudancas: z.array(MudancaAuditadaApi),
  })
  .meta({ id: 'EventoDoHistoricoApi' });

export const ReferenciaDoHistoricoApi = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.enum(['pessoa', 'equipe', 'local', 'ativo', 'bandeira']),
      nome: z.string(),
    }),
    z.object({
      tipo: z.enum(['situacao', 'prioridade', 'categoria']),
      chavePadrao: z.string().nullable(),
      nomes: z.record(z.string(), z.string()),
    }),
  ])
  .meta({ id: 'ReferenciaDoHistoricoApi' });

export const RespostaDoHistorico = z
  .object({
    entidade: z.enum(ENTIDADES_COM_HISTORICO_API),
    registroId: z.guid(),
    /** Idioma padrão do tenant, para o nome de situação, prioridade e categoria (ADR-027). */
    idiomaPadrao: z.string(),
    /** Da mais antiga para a mais nova. */
    eventos: z.array(EventoDoHistoricoApi),
    /** Nome dos ids que aparecem nas mudanças; o que quem pede não lê fica de fora. */
    referencias: z.record(z.string(), ReferenciaDoHistoricoApi),
  })
  .meta({ id: 'RespostaDoHistorico' });
