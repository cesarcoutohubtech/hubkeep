// Locais do hotel (fase 1a, B1): UHs do sistema hoteleiro (só leitura) e
// áreas comuns cadastradas à mão.
import { z } from 'zod';

export const TIPOS_DE_LOCAL_API = ['uh', 'area_comum'] as const;
export const STATUS_DE_LOCAL_API = ['ativo', 'pendente_licenca', 'inativo'] as const;

export const LocalApi = z
  .object({
    id: z.guid(),
    nome: z.string(),
    tipo: z.enum(TIPOS_DE_LOCAL_API),
    andar: z.string().nullable(),
    status: z.enum(STATUS_DE_LOCAL_API),
    /** sistema_hoteleiro: veio do CM, só leitura. manual: área comum cadastrada aqui. */
    origem: z.enum(['sistema_hoteleiro', 'manual']),
    editavel: z.boolean(),
  })
  .meta({ id: 'LocalApi' });

export const RespostaDeLocaisDoHotel = z
  .object({ locais: z.array(LocalApi) })
  .meta({ id: 'RespostaDeLocaisDoHotel' });

export const PedidoDeAreaComum = z
  .object({ nome: z.string().max(200), andar: z.string().max(64).nullable() })
  .meta({ id: 'PedidoDeAreaComum' });

export const RespostaDeLocalAlterado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeLocalAlterado' });
