// Sentry no servidor do Next (F0-07). Sem SENTRY_DSN, nada é iniciado.
// Coleta de dados desligada categoria por categoria (o padrão do SDK 11 coleta
// usuário, cookies, cabeçalhos e corpos): o Sentry recebe a pilha e as marcas
// de escopo (ids), nunca e-mail, IP, token, corpo, parâmetro de SQL ou variável
// local. Sem rastreamento de desempenho por ora (tracesSampleRate 0).
export async function register(): Promise<void> {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? 'dev',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
  });
}

/** Erros que escapam do invólucro rota() (páginas, Server Components). */
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  if (!process.env['SENTRY_DSN']) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
