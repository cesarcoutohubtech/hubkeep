// O envio do push pelo serviço de push do navegador (1c, ADR-046, C4), com a
// biblioteca web-push, só no servidor. A mensagem vai cifrada para o aparelho
// (RFC 8291), com o título, uma linha e o caminho do PWA; o serviço de push
// não lê o conteúdo. Sem as duas chaves VAPID, não há enviador: o worker
// registra o push como sem_provedor (C1).
import type { EnviadorDePush } from '@hubkeep/aplicacao';
import { inscricaoExpirou } from '@hubkeep/dominio';
import webpush from 'web-push';

/** O aviso perde o sentido depois disto: o serviço de push descarta. */
const VALIDADE_S = 60 * 60;

export function criarEnviadorDePush(c: {
  chavePublica: string;
  chavePrivada: string;
  /** Quem envia, para o serviço de push: a URL do site (https). */
  assunto: string;
}): EnviadorDePush {
  const vapidDetails = {
    subject: c.assunto,
    publicKey: c.chavePublica,
    privateKey: c.chavePrivada,
  };
  return {
    async enviar(destino, mensagem) {
      try {
        await webpush.sendNotification(
          { endpoint: destino.endpoint, keys: destino.chaves },
          JSON.stringify(mensagem),
          { vapidDetails, TTL: VALIDADE_S, urgency: 'high' },
        );
        return 'entregue';
      } catch (e) {
        const status = (e as { statusCode?: unknown }).statusCode;
        if (typeof status === 'number' && inscricaoExpirou(status)) return 'expirada';
        throw new Error(
          `Serviço de push respondeu ${typeof status === 'number' ? status : 'sem status'}.`,
          { cause: e },
        );
      }
    },
  };
}

/** O enviador, com as chaves do ambiente; null sem as duas chaves e o site (C1). */
export function enviadorDePushDoAmbiente(env: {
  publica: string | undefined;
  privada: string | undefined;
  site: string;
}): EnviadorDePush | null {
  if (!env.publica || !env.privada || !env.site.startsWith('https://')) return null;
  return criarEnviadorDePush({
    chavePublica: env.publica,
    chavePrivada: env.privada,
    assunto: env.site,
  });
}
