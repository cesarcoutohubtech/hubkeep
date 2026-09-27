// Proprietários e vínculos com UH ou hotel inteiro (fase 1a, A4; ADR-031).
// Datas de vigência em yyyy-mm-dd; os dois extremos valem, fim nulo é sem prazo.
import { z } from 'zod';

const Data = z.iso.date();
const Vigencia = { vigenciaInicio: Data, vigenciaFim: Data.nullable() };

export const VinculoDeProprietarioApi = z
  .object({
    id: z.guid(),
    tipo: z.enum(['uh', 'hotel']),
    hotelId: z.guid(),
    hotelNome: z.string(),
    /** Só no vínculo com UH. */
    localId: z.guid().nullable(),
    localNome: z.string().nullable(),
    ...Vigencia,
    vigente: z.boolean(),
  })
  .meta({ id: 'VinculoDeProprietarioApi' });

export const RespostaDeProprietarios = z
  .object({
    proprietarios: z.array(
      z.object({
        id: z.guid(),
        nome: z.string(),
        documento: z.string().nullable(),
        vinculos: z.array(VinculoDeProprietarioApi),
      }),
    ),
  })
  .meta({ id: 'RespostaDeProprietarios' });

export const PedidoDeProprietario = z
  .object({ nome: z.string().max(200), documento: z.string().max(64).nullable() })
  .meta({ id: 'PedidoDeProprietario' });

export const RespostaDeProprietarioAlterado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeProprietarioAlterado' });

export const PedidoDeVinculoDeProprietario = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('uh'), localId: z.guid(), ...Vigencia }),
    z.object({ tipo: z.literal('hotel'), hotelId: z.guid(), ...Vigencia }),
  ])
  .meta({ id: 'PedidoDeVinculoDeProprietario' });

export const PedidoDeVigenciaDoVinculo = z
  .object({ tipo: z.enum(['uh', 'hotel']), ...Vigencia })
  .meta({ id: 'PedidoDeVigenciaDoVinculo' });

export const RespostaDeVinculoDeProprietario = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeVinculoDeProprietario' });

export const RespostaDeLocaisDoHotel = z
  .object({
    locais: z.array(
      z.object({
        id: z.guid(),
        nome: z.string(),
        tipo: z.enum(['uh', 'area_comum']),
        status: z.string(),
      }),
    ),
  })
  .meta({ id: 'RespostaDeLocaisDoHotel' });
