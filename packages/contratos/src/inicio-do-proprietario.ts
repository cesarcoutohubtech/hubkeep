// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade): as
// UHs ativas de cada hotel a que o proprietário está ligado por UHs.
import { z } from 'zod';

export const RespostaDoInicioDoProprietario = z
  .object({
    /** Pelo nome do hotel; o hotel de que ele é dono inteiro não entra. */
    uhsAcompanhadas: z.array(
      z.object({
        hotelId: z.guid(),
        hotelNome: z.string(),
        uhs: z.int().min(1),
      }),
    ),
  })
  .meta({ id: 'RespostaDoInicioDoProprietario' });
