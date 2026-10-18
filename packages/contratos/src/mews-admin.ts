// Resposta minima do status administrativo Mews. Sem entrada de escrita.
import { z } from 'zod';

export const LinhaDoStatusMewsApi = z.object({
  hotelId: z.guid(),
  nome: z.string(),
  versao: z.string().nullable(),
  ultimoUpdatedUtc: z.iso.datetime().nullable(),
  ultimoSweepUtc: z.iso.datetime().nullable(),
  concluidoEm: z.iso.datetime().nullable(),
  recursosAtivos: z.number().int().nonnegative(),
  bloqueiosOutOfOrder: z.number().int().nonnegative(),
  bloqueiosInternalUse: z.number().int().nonnegative(),
});

export const RespostaDoStatusMews = z.object({
  hoteis: z.array(LinhaDoStatusMewsApi),
});
