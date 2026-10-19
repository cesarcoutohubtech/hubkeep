// Comunicação (1c, item 5; ADR-046): a contagem de envios por destinatário e
// por dia (C8), para a gestão saber quem passa do limite e abrir o resumo
// agrupado. O dia é a data UTC do envio; as falhas não contam. E a inscrição
// do aparelho no push do PWA do técnico (C4).
import { z } from 'zod';

/** Os canais do envio (dominio, CANAIS_DE_ENVIO). */
export const CANAIS_DE_ENVIO_API = ['email', 'push'] as const;

/** Período de até 31 dias, de (inclusive) até ate (exclusive); o hotel é opcional. */
export const ConsultaDaContagemDeEnvios = z
  .object({
    de: z.iso.datetime({ offset: true }),
    ate: z.iso.datetime({ offset: true }),
    hotelId: z.guid().optional(),
  })
  .meta({ id: 'ConsultaDaContagemDeEnvios' });

export const ContagemDeEnviosApi = z
  .object({
    usuarioId: z.guid(),
    /** Null se quem pede não lê o membro. */
    nome: z.string().nullable(),
    canal: z.enum(CANAIS_DE_ENVIO_API),
    /** AAAA-MM-DD, em UTC. */
    dia: z.iso.date(),
    envios: z.int(),
    /** Passou do limite por pessoa e por dia (C8). */
    acimaDoLimite: z.boolean(),
  })
  .meta({ id: 'ContagemDeEnviosApi' });

export const RespostaDaContagemDeEnvios = z
  .object({
    limite: z.int(),
    /** Do dia mais recente; no mesmo dia, de quem recebeu mais; uma linha por canal. */
    dias: z.array(ContagemDeEnviosApi),
  })
  .meta({ id: 'RespostaDaContagemDeEnvios' });

/** A chave pública VAPID do servidor; null: o push não está ligado no ambiente (C1). */
export const ConfiguracaoDoPushApi = z
  .object({ chavePublica: z.string().nullable() })
  .meta({ id: 'ConfiguracaoDoPushApi' });

// O endpoint do serviço de push do navegador é sempre https; as chaves são
// base64url (PushSubscription.toJSON()).
const Endpoint = z.url({ protocol: /^https$/ }).max(2048);
const Base64Url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** A inscrição do aparelho, como o navegador a entrega (PushSubscription.toJSON()). */
export const PedidoDeInscricaoPush = z
  .object({
    endpoint: Endpoint,
    keys: z.object({ p256dh: Base64Url.max(200), auth: Base64Url.max(100) }),
  })
  .meta({ id: 'PedidoDeInscricaoPush' });

export const RespostaDaInscricaoPush = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDaInscricaoPush' });

/** O aparelho a desativar, pelo endpoint dele. */
export const PedidoDeRevogacaoPush = z
  .object({ endpoint: Endpoint })
  .meta({ id: 'PedidoDeRevogacaoPush' });

export const RespostaDaRevogacaoPush = z
  .object({ revogada: z.literal(true) })
  .meta({ id: 'RespostaDaRevogacaoPush' });
