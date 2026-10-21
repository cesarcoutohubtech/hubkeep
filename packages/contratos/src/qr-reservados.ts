// Códigos de QR reservados (fase 1b, M3): gerar um lote para o hotel, listar
// os códigos com o que já está ligado e consultar o código lido da etiqueta.
import { z } from 'zod';

/** O limite do lote, igual ao do domínio (tests/contratos-dominio). */
export const LIMITE_DO_LOTE_DE_QR_API = 500;

export const PedidoDeLoteDeQr = z.object({ quantidade: z.int() }).meta({ id: 'PedidoDeLoteDeQr' });

export const RespostaDeLoteDeQr = z
  .object({ loteId: z.guid(), codigos: z.array(z.string()) })
  .meta({ id: 'RespostaDeLoteDeQr' });

export const CodigoReservadoApi = z
  .object({
    codigo: z.string(),
    loteId: z.guid(),
    criadoEm: z.iso.datetime(),
    /** Já existe ativo com o código. */
    ligado: z.boolean(),
  })
  .meta({ id: 'CodigoReservadoApi' });

export const RespostaDeCodigosReservados = z
  .object({ codigos: z.array(CodigoReservadoApi) })
  .meta({ id: 'RespostaDeCodigosReservados' });

/** O código lido da etiqueta: o hotel em que está reservado e se já tem ativo. */
export const RespostaDeCodigoReservado = z
  .object({ codigo: z.string(), hotelId: z.guid(), ligado: z.boolean() })
  .meta({ id: 'RespostaDeCodigoReservado' });
