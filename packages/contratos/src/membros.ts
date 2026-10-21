// Gestão de membros e papéis (fase 1a, A3): lista com as atribuições visíveis,
// concessão e revogação de papel, mudança de validade e desativação.
import { z } from 'zod';
import { PAPEIS_API } from './api';

export const EscopoApi = z
  .discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('grupo') }),
    z.object({ tipo: z.literal('bandeira'), bandeiraId: z.guid() }),
    z.object({ tipo: z.literal('hotel'), hotelId: z.guid() }),
    z.object({ tipo: z.literal('proprietario'), proprietarioId: z.guid() }),
  ])
  .meta({ id: 'EscopoApi' });

export const AtribuicaoApi = z
  .object({
    id: z.guid(),
    papel: z.enum(PAPEIS_API),
    escopo: EscopoApi,
    validoAte: z.iso.datetime({ offset: true }).nullable(),
    revogadoEm: z.iso.datetime({ offset: true }).nullable(),
    /** Não revogada e dentro da validade, no momento da resposta. */
    vigente: z.boolean(),
  })
  .meta({ id: 'AtribuicaoApi' });

export const RespostaDeMembros = z
  .object({
    membros: z.array(
      z.object({
        usuarioId: z.guid(),
        nome: z.string(),
        email: z.string(),
        ativo: z.boolean(),
        atribuicoes: z.array(AtribuicaoApi),
      }),
    ),
  })
  .meta({ id: 'RespostaDeMembros' });

export const PedidoDeConcessaoDePapel = z
  .object({
    usuarioId: z.guid(),
    papel: z.enum(PAPEIS_API),
    escopo: EscopoApi,
    /** Obrigatória para o Implantador (regra do domínio). */
    validoAte: z.iso.datetime({ offset: true }).nullish(),
  })
  .meta({ id: 'PedidoDeConcessaoDePapel' });

export const RespostaDeConcessaoDePapel = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeConcessaoDePapel' });

export const RespostaDeRevogacaoDePapel = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeRevogacaoDePapel' });

export const PedidoDeValidade = z
  .object({ validoAte: z.iso.datetime({ offset: true }).nullable() })
  .meta({ id: 'PedidoDeValidade' });

export const RespostaDeValidade = z
  .object({ id: z.guid(), validoAte: z.iso.datetime({ offset: true }).nullable() })
  .meta({ id: 'RespostaDeValidade' });

export const RespostaDeAtivoDoMembro = z
  .object({ usuarioId: z.guid(), ativo: z.boolean() })
  .meta({ id: 'RespostaDeAtivoDoMembro' });

/** A remoção do segundo fator (SP1, ADR-049): quantos fatores o Auth removeu. */
export const RespostaDeRemocaoDoSegundoFator = z
  .object({ usuarioId: z.guid(), removidos: z.number().int().min(0) })
  .meta({ id: 'RespostaDeRemocaoDoSegundoFator' });
