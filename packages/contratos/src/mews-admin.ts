// Resposta minima do status administrativo Mews. Sem entrada de escrita.
import { z } from 'zod';

export const LinhaDoStatusMewsApi = z
  .object({
    hotelId: z.guid(),
    nome: z.string(),
    versao: z.string().nullable(),
    ultimoUpdatedUtc: z.iso.datetime().nullable(),
    ultimoSweepUtc: z.iso.datetime().nullable(),
    concluidoEm: z.iso.datetime().nullable(),
    recursosAtivos: z.number().int().nonnegative(),
    bloqueiosOutOfOrder: z.number().int().nonnegative(),
    bloqueiosInternalUse: z.number().int().nonnegative(),
  })
  .meta({ id: 'LinhaDoStatusMewsApi' });

export const RespostaDoStatusMews = z
  .object({
    hoteis: z.array(LinhaDoStatusMewsApi),
  })
  .meta({ id: 'RespostaDoStatusMews' });

/** Pré-seleção informativa: esta API nunca cria vínculo ou consulta a Mews. */
export const CandidatoHotelMewsApi = z
  .object({
    hotelId: z.guid(),
    nome: z.string(),
    status: z.string(),
    vinculo: z.enum(['nenhum', 'ativo', 'revogado']),
    candidato: z.boolean(),
  })
  .meta({ id: 'CandidatoHotelMewsApi' });

export const RespostaDeCandidatosMews = z
  .object({
    hoteis: z.array(CandidatoHotelMewsApi),
    truncado: z.boolean(),
  })
  .meta({ id: 'RespostaDeCandidatosMews' });
