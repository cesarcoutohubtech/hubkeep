// Hotéis a partir do staging (fase 1a, A1): a lista do que chegou do sistema
// hoteleiro, a importação para implantação e a ativação, que consome licença.
import { z } from 'zod';
import { STATUS_HOTEL_API } from './api';

const UsoDaLicenca = z
  .object({
    hoteis: z.object({ contratados: z.number().int(), emUso: z.number().int() }),
    uhs: z.object({ contratadas: z.number().int(), emUso: z.number().int() }),
  })
  .meta({ id: 'UsoDaLicenca' });

export const HotelParaAtivacao = z
  .object({
    fonte: z.string(),
    chave: z.string(),
    /** Nome e fuso como vieram do sistema hoteleiro (null: ausente ou inválido). */
    nome: z.string().nullable(),
    fuso: z.string().nullable(),
    recebidoEm: z.iso.datetime({ offset: true }),
    /** Hotel já cadastrado com este código; null: ainda não importado. */
    hotel: z
      .object({
        id: z.guid(),
        status: z.enum(STATUS_HOTEL_API),
        nome: z.string(),
        fuso: z.string(),
      })
      .nullable(),
    /** Campos em que o cadastro difere do sistema hoteleiro. */
    diferencas: z.array(z.enum(['nome', 'fuso'])),
  })
  .meta({ id: 'HotelParaAtivacao' });

export const RespostaDeHoteisDoStaging = z
  .object({ hoteis: z.array(HotelParaAtivacao), uso: UsoDaLicenca })
  .meta({ id: 'RespostaDeHoteisDoStaging' });

export const PedidoDeImportacaoDeHotel = z
  .object({
    fonte: z.string().min(1).max(50),
    chave: z.string().min(1).max(200),
    /** Obrigatório se o sistema hoteleiro não mandou um fuso válido. */
    fuso: z.string().max(64).nullish(),
  })
  .meta({ id: 'PedidoDeImportacaoDeHotel' });

export const RespostaDeImportacaoDeHotel = z
  .object({ hotelId: z.guid() })
  .meta({ id: 'RespostaDeImportacaoDeHotel' });

export const RespostaDeAtivacaoDeHotel = z
  .object({
    hotelId: z.guid(),
    /** UHs pendentes de licença que entraram com a ativação. */
    uhsLiberadas: z.number().int().nonnegative(),
    /** UHs que continuam pendentes, por falta de saldo de UHs. */
    uhsPendentes: z.number().int().nonnegative(),
  })
  .meta({ id: 'RespostaDeAtivacaoDeHotel' });
