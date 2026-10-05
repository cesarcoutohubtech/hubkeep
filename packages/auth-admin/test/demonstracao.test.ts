// Adendo ao ADR-024 (M1 do docs/11): a conta do kit de teste usa a chave deste
// pacote, e por isso nunca roda na Vercel. A recusa vem antes de criar o
// cliente do Supabase, então este teste não precisa de chave nem de rede.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarIdentidadeDeDemonstracao } from '../src/index';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('identidade de demonstração fora da Vercel', () => {
  it.each(['preview', 'production', 'development'])('VERCEL_ENV=%s: recusa', (ambiente) => {
    vi.stubEnv('VERCEL_ENV', ambiente);
    expect(() =>
      criarIdentidadeDeDemonstracao({ url: 'https://x.supabase.co', senha: 'x' }),
    ).toThrow(/não roda na Vercel/);
  });
});
