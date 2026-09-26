// Sentry adiado até o piloto (decisão do Cesar, 26/09/2026). Sem SENTRY_DSN, a
// aplicação funciona normalmente, só com os logs estruturados: o SDK não é
// iniciado, nada é enviado, e o erro inesperado continua virando 500 com
// request_id e uma linha erro_inesperado no log.
import { CODIGOS_HTTP } from '@hubkeep/contratos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => sdk);

const { onRequestError, register } = await import('../src/instrumentation');
const { relatarAoSentry } = await import('../src/servidor/sentry');
const { rota } = await import('../src/servidor/http');

let dsnAntes: string | undefined;
beforeEach(() => {
  dsnAntes = process.env['SENTRY_DSN'];
  delete process.env['SENTRY_DSN'];
  vi.clearAllMocks();
});
afterEach(() => {
  if (dsnAntes === undefined) delete process.env['SENTRY_DSN'];
  else process.env['SENTRY_DSN'] = dsnAntes;
});

describe('sem SENTRY_DSN', () => {
  it('o SDK não é iniciado e nada é enviado', async () => {
    await register();
    relatarAoSentry(new Error('x'), { tenant_id: 't' });
    await onRequestError(
      ...([new Error('x'), {}, {}] as unknown as Parameters<typeof onRequestError>),
    );
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.withScope).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
  });

  it('erro inesperado: 500 com request_id e a linha erro_inesperado no log, com o relator de verdade', async () => {
    const linhas: { nivel: string; evento: string }[] = [];
    const handler = rota(
      'teste.falha',
      async () => {
        throw new Error('falha inesperada');
      },
      {
        registrar: (nivel, evento) => void linhas.push({ nivel, evento }),
        relatar: relatarAoSentry,
      },
    );
    const r = await handler(new Request('http://127.0.0.1:3000/api/v1/teste'));
    expect(r.status).toBe(500);
    const corpo = (await r.json()) as { erro: { codigo: string; requestId: string } };
    expect(corpo.erro.codigo).toBe(CODIGOS_HTTP.erroInterno);
    expect(corpo.erro.requestId).toBe(r.headers.get('x-request-id'));
    expect(linhas).toContainEqual({ nivel: 'error', evento: 'erro_inesperado' });
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('controle: com DSN, o SDK é iniciado (o teste enxerga o que procura)', async () => {
    process.env['SENTRY_DSN'] = 'https://chave@exemplo.invalid/1';
    await register();
    expect(sdk.init).toHaveBeenCalledOnce();
  });
});
