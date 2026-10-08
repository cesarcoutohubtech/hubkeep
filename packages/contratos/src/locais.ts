// Locais do hotel (fase 1a, B1): UHs do sistema hoteleiro (só leitura, menos a
// edificação, I2) e áreas comuns cadastradas à mão.
import { z } from 'zod';

export const TIPOS_DE_LOCAL_API = ['uh', 'area_comum'] as const;
export const STATUS_DE_LOCAL_API = ['ativo', 'pendente_licenca', 'inativo'] as const;

export const LocalApi = z
  .object({
    id: z.guid(),
    nome: z.string(),
    tipo: z.enum(TIPOS_DE_LOCAL_API),
    andar: z.string().nullable(),
    /** Torre, bloco (I2); editável também na UH do sistema hoteleiro. */
    edificacao: z.string().nullable(),
    status: z.enum(STATUS_DE_LOCAL_API),
    /** sistema_hoteleiro: veio do CM, só leitura. manual: área comum cadastrada aqui. */
    origem: z.enum(['sistema_hoteleiro', 'manual']),
    editavel: z.boolean(),
  })
  .meta({ id: 'LocalApi' });

export const RespostaDeLocaisDoHotel = z
  .object({
    locais: z.array(LocalApi),
    /** As edificações que já existem no hotel, para a tela sugerir (I2), sem o filtro da busca. */
    edificacoes: z.array(z.string()),
  })
  .meta({ id: 'RespostaDeLocaisDoHotel' });

/** A edificação (I2) é opcional: ausente, mantém a gravada (na criação, nenhuma); null apaga. */
export const PedidoDeAreaComum = z
  .object({
    nome: z.string().max(200),
    andar: z.string().max(64).nullable(),
    edificacao: z.string().max(200).nullable().optional(),
  })
  .meta({ id: 'PedidoDeAreaComum' });

/** Só a edificação, em qualquer local, inclusive a UH do sistema hoteleiro (I2). null apaga. */
export const PedidoDeEdificacao = z
  .object({ edificacao: z.string().max(200).nullable() })
  .meta({ id: 'PedidoDeEdificacao' });

export const RespostaDeLocalAlterado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeLocalAlterado' });
