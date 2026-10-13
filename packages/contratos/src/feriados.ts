// Feriados do hotel (fase 1c; ADR-042): o feriado municipal e o do próprio
// hotel, que contam no calendário de SLA do hotel.
import { z } from 'zod';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const FeriadoDoHotelApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    /** 'AAAA-MM-DD', no calendário local do hotel. */
    data: z.string().regex(DATA),
    nome: z.string(),
    /** Repete todo ano no mesmo dia e mês. */
    anual: z.boolean(),
    ativo: z.boolean(),
  })
  .meta({ id: 'FeriadoDoHotelApi' });

export const RespostaDeFeriados = z
  .object({
    feriados: z.array(FeriadoDoHotelApi),
    /** Quem pede pode cadastrar e alterar (a gestão do hotel e o Implantador). */
    podeCadastrar: z.boolean(),
  })
  .meta({ id: 'RespostaDeFeriados' });

export const PedidoDeFeriado = z
  .object({
    data: z.string().regex(DATA),
    nome: z.string().max(200),
    anual: z.boolean().optional(),
  })
  .meta({ id: 'PedidoDeFeriado' });

/** A data não muda: para trocar, desativa e cadastra outro. */
export const PedidoDeAlteracaoDeFeriado = z
  .object({ nome: z.string().max(200).optional(), anual: z.boolean().optional() })
  .refine((p) => p.nome !== undefined || p.anual !== undefined)
  .meta({ id: 'PedidoDeAlteracaoDeFeriado' });

export const RespostaDeFeriadoAlterado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeFeriadoAlterado' });
