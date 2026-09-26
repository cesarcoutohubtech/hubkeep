// Operações que o PWA do técnico fez sem rede (F0-11, ADR-025). Cada uma leva
// a chave de idempotência gerada no aparelho; o reenvio da mesma chave devolve
// a resposta guardada, sem aplicar de novo.
import { z } from 'zod';
import { PedidoDePreferencias } from './preferencias';

export const TIPOS_DE_OPERACAO_OFFLINE = ['preferencias.gravar'] as const;

export const PedidoDeOperacaoOffline = z
  .discriminatedUnion('tipo', [
    z.object({
      /** Gerada no aparelho (crypto.randomUUID), uma por operação. */
      chave: z.guid(),
      tipo: z.literal('preferencias.gravar'),
      dados: PedidoDePreferencias,
    }),
  ])
  .meta({ id: 'PedidoDeOperacaoOffline' });
export type PedidoDeOperacaoOffline = z.infer<typeof PedidoDeOperacaoOffline>;

export const RespostaDeOperacaoOffline = z
  .object({
    chave: z.guid(),
    /** true: a chave já tinha chegado; nada foi aplicado de novo. */
    repetida: z.boolean(),
    resposta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .meta({ id: 'RespostaDeOperacaoOffline' });
export type RespostaDeOperacaoOffline = z.infer<typeof RespostaDeOperacaoOffline>;
