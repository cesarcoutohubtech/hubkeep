// Erros inesperados vão para o Sentry com as marcas de escopo do pedido. Sem
// SENTRY_DSN (dev, CI), nada é enviado. O Sentry recebe ids, nunca e-mail,
// corpo de requisição ou cabeçalho de autenticação (dataCollection desligado
// em instrumentation.ts).
import * as Sentry from '@sentry/nextjs';

export type Relator = (erro: unknown, marcas: Record<string, string | null | undefined>) => void;

export const relatarAoSentry: Relator = (erro, marcas) => {
  if (!process.env['SENTRY_DSN']) return;
  Sentry.withScope((escopo) => {
    for (const [chave, valor] of Object.entries(marcas)) {
      if (valor) escopo.setTag(chave, valor);
    }
    Sentry.captureException(erro);
  });
};

/**
 * Check-in de um monitor de cron no Sentry, com a config do monitor (o Sentry
 * cria ou atualiza o monitor pelo próprio check-in). Sem SENTRY_DSN, nada é
 * enviado. Espera o envio, porque a função da Vercel pode parar logo depois
 * da resposta.
 */
export async function enviarCheckInAoSentry(
  checkIn: { monitorSlug: string; status: 'ok' | 'error'; duration: number },
  config: Parameters<typeof Sentry.captureCheckIn>[1],
): Promise<void> {
  if (!process.env['SENTRY_DSN']) return;
  Sentry.captureCheckIn(checkIn, config);
  await Sentry.flush(2000);
}
