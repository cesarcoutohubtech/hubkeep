// Auditoria geral (fase 1c; decisões 12 a 14 do Cesar de 13/10/2026): a
// auditoria que a gestão enxerga, por período (até 92 dias), hotel, tipo de
// registro, ação e pessoa, em páginas por cursor. A entidade, a ação e o campo
// são códigos, com o nome no catálogo; os valores são dados, e os ids que
// aparecem neles vêm com o nome em `referencias`, como no histórico (D1).
import { z } from 'zod';
import { MudancaAuditadaApi, ReferenciaDoHistoricoApi } from './historico';

/** As entidades gravadas na auditoria (dominio, ENTIDADES_DA_AUDITORIA). */
export const ENTIDADES_DA_AUDITORIA_API = [
  'anexo',
  'ativo',
  'atribuicao_escopo',
  'bandeira',
  'categoria_ativo',
  'chamado',
  'checklist_modelo',
  'codigo_manutencao',
  'credencial_agente',
  'equipe',
  'feriado_hotel',
  'fornecedor',
  'hotel',
  'hotel_proprietario',
  'insight',
  'job_inteligencia',
  'local',
  'local_proprietario',
  'membro',
  'modelo_ativo',
  'os',
  'os_apontamento',
  'os_checklist',
  'os_material',
  'parada_ativo',
  'plano_preventivo',
  'politica',
  'preferencia_membro',
  'prioridade',
  'proprietario',
  'sinal_hospede',
  'situacao',
  'tenant',
  'uh_indisponivel',
] as const;

export const ConsultaDaAuditoriaGeral = z
  .object({
    /** Início do período, inclusive. */
    de: z.iso.datetime({ offset: true }),
    /** Fim do período, exclusive; até 92 dias depois do início. */
    ate: z.iso.datetime({ offset: true }),
    hotelId: z.guid().optional(),
    entidade: z.enum(ENTIDADES_DA_AUDITORIA_API).optional(),
    acao: z
      .string()
      .regex(/^[a-z][a-z_]{1,39}$/)
      .optional(),
    /** O id da pessoa, ou 'sistema' para o que um job gravou. */
    pessoa: z.union([z.guid(), z.literal('sistema')]).optional(),
    /** O `proximoCursor` da página anterior. */
    cursor: z.string().max(80).optional(),
    /** '1': a página da exportação (1.000 linhas), para o CSV. */
    exportacao: z.literal('1').optional(),
  })
  .meta({ id: 'ConsultaDaAuditoriaGeral' });

export const LinhaDaAuditoriaGeralApi = z
  .object({
    id: z.guid(),
    em: z.iso.datetime(),
    hotelId: z.guid().nullable(),
    /** null sem hotel, ou se quem pede não lê o hotel. */
    hotelNome: z.string().nullable(),
    entidade: z.string(),
    registroId: z.guid(),
    /** A ação gravada (ex.: criar, triar); o nome sai do catálogo. */
    acao: z.string(),
    usuarioId: z.guid().nullable(),
    /** null se quem pede não lê o membro, ou se foi um job. */
    usuarioNome: z.string().nullable(),
    mudancas: z.array(MudancaAuditadaApi),
  })
  .meta({ id: 'LinhaDaAuditoriaGeralApi' });

export const RespostaDaAuditoriaGeral = z
  .object({
    /** Da mais nova para a mais antiga. */
    linhas: z.array(LinhaDaAuditoriaGeralApi),
    referencias: z.record(z.string(), ReferenciaDoHistoricoApi),
    /** Idioma padrão do tenant, para o nome de situação, prioridade e categoria. */
    idiomaPadrao: z.string(),
    /** Para a página seguinte; null na última. */
    proximoCursor: z.string().nullable(),
  })
  .meta({ id: 'RespostaDaAuditoriaGeral' });
