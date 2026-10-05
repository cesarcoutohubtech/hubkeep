// Adendo ao ADR-024 (M1 do docs/11): a conta do kit de teste nunca roda na
// Vercel. A recusa do servidor do web vem antes de chegar ao auth-admin (que
// recusa de novo; packages/auth-admin/test/demonstracao.test.ts), então este
// teste não precisa de chave nem de rede.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { identidadeDeDemonstracao } from '../src/servidor/demonstracao';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('identidade de demonstração fora da Vercel', () => {
  it.each(['preview', 'production', 'development'])('VERCEL_ENV=%s: recusa', (ambiente) => {
    vi.stubEnv('VERCEL_ENV', ambiente);
    expect(() => identidadeDeDemonstracao('x')).toThrow(/não rodam na Vercel/);
  });
});
