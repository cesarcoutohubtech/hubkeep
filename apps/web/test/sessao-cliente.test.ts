// U0: o login do web cria o cliente do Supabase uma vez só. Antes, cada
// entrada criava outro, e o navegador avisava "Multiple GoTrueClient instances".
// SP1 (ADR-049): o código do segundo fator vem antes de a sessão ir para o
// cookie, e o cadastro do fator começa quando /auth/sessao pede.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const criar = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: criar }));

const SESSAO = { access_token: 'acesso', refresh_token: 'renovacao' };

function montar(o: { fatores?: { id: string }[]; pendentes?: { id: string }[] } = {}) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: SESSAO }, error: null }),
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { session: { ...SESSAO, access_token: 'aal2' } } }),
    mfa: {
      listFactors: vi.fn().mockResolvedValue({
        data: {
          totp: o.fatores ?? [],
          all: [
            ...(o.fatores ?? []).map((f) => ({ ...f, factor_type: 'totp', status: 'verified' })),
            ...(o.pendentes ?? []).map((f) => ({
              ...f,
              factor_type: 'totp',
              status: 'unverified',
            })),
          ],
        },
      }),
      unenroll: vi.fn().mockResolvedValue({ error: null }),
      enroll: vi.fn().mockResolvedValue({
        data: {
          id: 'f-novo',
          totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SEGREDO' },
        },
        error: null,
      }),
      challengeAndVerify: vi.fn().mockResolvedValue({ error: null }),
    },
  };
  criar.mockReturnValue({ auth });
  return auth;
}

const resposta = (status: number, corpo?: unknown) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status });

describe('cliente do Supabase no login do web (U0)', () => {
  beforeEach(() => {
    vi.resetModules();
    criar.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('várias entradas usam o mesmo cliente', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    criar.mockReturnValue({ auth: { signInWithPassword } });
    vi.stubGlobal('fetch', vi.fn());
    const { entrar } = await import('../src/cliente/sessao');

    expect(await entrar('a@a.test', 'x')).toEqual({ tipo: 'credenciais' });
    expect(await entrar('a@a.test', 'y')).toEqual({ tipo: 'credenciais' });
    expect(await entrar('b@a.test', 'z')).toEqual({ tipo: 'credenciais' });

    expect(criar).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
    // A sessão continua só em memória: nada de token guardado na página.
    expect(criar.mock.calls[0]?.[2]).toEqual({
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});

describe('segundo fator no login do web (SP1)', () => {
  beforeEach(() => {
    vi.resetModules();
    criar.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem fator e sem exigência: a sessão vai direto para o cookie', async () => {
    montar();
    const fetch = vi.fn().mockResolvedValue(resposta(204));
    vi.stubGlobal('fetch', fetch);
    const { entrar } = await import('../src/cliente/sessao');
    expect(await entrar('a@a.test', 'x')).toEqual({ tipo: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('com o TOTP cadastrado: pede o código antes de gravar, e grava a sessão em aal2', async () => {
    const auth = montar({ fatores: [{ id: 'f-1' }] });
    const fetch = vi.fn().mockResolvedValue(resposta(204));
    vi.stubGlobal('fetch', fetch);
    const { confirmarCodigo, entrar } = await import('../src/cliente/sessao');
    expect(await entrar('a@a.test', 'x')).toEqual({ tipo: 'codigo' });
    expect(fetch).not.toHaveBeenCalled();
    expect(await confirmarCodigo('123456')).toBe('ok');
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-1', code: '123456' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toMatchObject({
      accessToken: 'aal2',
    });
  });

  it('código errado: não grava nada', async () => {
    const auth = montar({ fatores: [{ id: 'f-1' }] });
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: { message: 'invalid' } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { confirmarCodigo, entrar } = await import('../src/cliente/sessao');
    await entrar('a@a.test', 'x');
    expect(await confirmarCodigo('000000')).toBe('codigo_invalido');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('o papel exige e não há fator: tira o cadastro pendente e começa um novo', async () => {
    const auth = montar({ pendentes: [{ id: 'f-velho' }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resposta(403, { erro: { codigo: 'segundo_fator_obrigatorio' } })),
    );
    const { entrar } = await import('../src/cliente/sessao');
    expect(await entrar('a@a.test', 'x')).toEqual({
      tipo: 'cadastro',
      qr: 'data:image/svg+xml;utf-8,<svg/>',
      segredo: 'SEGREDO',
    });
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f-velho' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
  });

  it('outra recusa de /auth/sessao: falha, sem cadastro', async () => {
    const auth = montar();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(401, { erro: { codigo: 'x' } })));
    const { entrar } = await import('../src/cliente/sessao');
    expect(await entrar('a@a.test', 'x')).toEqual({ tipo: 'falha' });
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
});
