// Bandeiras (fase 1a, A2): lista, criação, renomeação, desativação e a troca
// da bandeira de um hotel.
import { z } from 'zod';

export const BandeiraApi = z
  .object({ id: z.guid(), nome: z.string(), ativa: z.boolean() })
  .meta({ id: 'BandeiraApi' });

export const RespostaDeBandeiras = z
  .object({ bandeiras: z.array(BandeiraApi) })
  .meta({ id: 'RespostaDeBandeiras' });

export const PedidoDeBandeira = z
  .object({ nome: z.string().max(200) })
  .meta({ id: 'PedidoDeBandeira' });

export const RespostaDeBandeiraCriada = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeBandeiraCriada' });

export const RespostaDeBandeiraAlterada = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeBandeiraAlterada' });

export const PedidoDeBandeiraDoHotel = z
  .object({ bandeiraId: z.guid().nullable() })
  .meta({ id: 'PedidoDeBandeiraDoHotel' });

export const RespostaDeBandeiraDoHotel = z
  .object({ hotelId: z.guid(), bandeiraId: z.guid().nullable() })
  .meta({ id: 'RespostaDeBandeiraDoHotel' });
