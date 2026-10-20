// Avisos de SLA em aberto (fase 1c; ADR-043, M4): o painel do hotel e o selo
// da ficha do chamado. O tipo e o nível são os do domínio
// (TIPOS_DE_ALERTA_DE_SLA, NIVEIS_DO_AVISO; tests/contratos-dominio). E os
// próximos prazos a vencer, da contagem regressiva da tela inicial (1c, seção
// 4 da paridade), com o tipo de prazo do domínio (TIPOS_DE_PRAZO).
import { z } from 'zod';
import { ESTADOS_DO_CHAMADO_API } from './situacoes';

export const TIPOS_DE_ALERTA_DE_SLA_API = [
  'atendimento_em_risco',
  'atendimento_vencido',
  'solucao_em_risco',
  'solucao_vencida',
] as const;
export const NIVEIS_DO_AVISO_API = ['em_risco', 'vencido'] as const;

export const AvisoDeSlaApi = z
  .object({
    tipo: z.enum(TIPOS_DE_ALERTA_DE_SLA_API),
    nivel: z.enum(NIVEIS_DO_AVISO_API),
    /** O prazo a que o aviso se refere. */
    prazo: z.iso.datetime(),
  })
  .meta({ id: 'AvisoDeSlaApi' });

export const ChamadoNoPainelDeSlaApi = z
  .object({
    chamadoId: z.guid(),
    descricao: z.string(),
    estado: z.enum(ESTADOS_DO_CHAMADO_API),
    prioridadeId: z.guid().nullable(),
    /** No máximo um por prazo (atendimento e solução), o mais forte. */
    avisos: z.array(AvisoDeSlaApi).min(1),
  })
  .meta({ id: 'ChamadoNoPainelDeSlaApi' });

export const RespostaDoPainelDeSla = z
  .object({
    /** Os vencidos primeiro, depois pelo prazo mais próximo. */
    chamados: z.array(ChamadoNoPainelDeSlaApi),
  })
  .meta({ id: 'RespostaDoPainelDeSla' });

export const TIPOS_DE_PRAZO_API = ['atendimento', 'solucao'] as const;

export const PrazoAVencerApi = z
  .object({
    chamadoId: z.guid(),
    hotelId: z.guid(),
    hotelNome: z.string(),
    descricao: z.string(),
    prioridadeId: z.guid().nullable(),
    tipo: z.enum(TIPOS_DE_PRAZO_API),
    /** O prazo, que ainda não passou. */
    prazo: z.iso.datetime(),
    /** O monitor já gravou o aviso "em risco" para este prazo. */
    emRisco: z.boolean(),
  })
  .meta({ id: 'PrazoAVencerApi' });

export const RespostaDosProximosPrazos = z
  .object({
    /** Do mais perto ao mais longe, no máximo seis. */
    prazos: z.array(PrazoAVencerApi).max(6),
  })
  .meta({ id: 'RespostaDosProximosPrazos' });

export const RespostaDosAvisosDoChamado = z
  .object({
    /** Vazio sem aviso em aberto, e para quem não é da gestão do hotel. */
    avisos: z.array(AvisoDeSlaApi),
  })
  .meta({ id: 'RespostaDosAvisosDoChamado' });
