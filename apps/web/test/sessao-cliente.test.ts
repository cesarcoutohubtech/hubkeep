// U0: o login do web cria o cliente do Supabase uma vez só. Antes, cada
// entrada criava outro, e o navegador avisava "Multiple GoTrueClient instances".
import { afterEach, describe, expect, it, vi } from 'vitest';

const criar = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: criar }));

describe('cliente do Supabase no login do web (U0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('várias entradas usam o mesmo cliente', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    criar.mockReturnValue({ auth: { signInWithPassword } });
    vi.stubGlobal('fetch', vi.fn());
    const { entrar } = await import('../src/cliente/sessao');

    expect(await entrar('a@a.test', 'x')).toBe(false);
    expect(await entrar('a@a.test', 'y')).toBe(false);
    expect(await entrar('b@a.test', 'z')).toBe(false);

    expect(criar).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
    // A sessão continua só em memória: nada de token guardado na página.
    expect(criar.mock.calls[0]?.[2]).toEqual({
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});
