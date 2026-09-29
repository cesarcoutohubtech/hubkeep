// Cabeçalhos de segurança, CSRF por origem e cookie de sessão (S1, ADR-032).
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import config from '../next.config';
import { proxy } from '../src/proxy';
import {
  POLITICA_DA_API,
  cabecalhosFixos,
  novoNonce,
  origemAceita,
  politicaDeConteudo,
} from '../src/seguranca';
import { comCookies, opcoesDoCookieDeSessao } from '../src/servidor/sessao-supabase';

const SITE = 'https://app.hubkeep.test';

const pedido = (metodo: string, cabecalhos: Record<string, string> = {}, caminho = '/api/v1/x') =>
  origemAceita({
    metodo,
    caminho,
    origemDoSite: SITE,
    cabecalhos: new Headers(cabecalhos),
  });

describe('CSRF: mudança de estado com cookie só da própria origem', () => {
  it('leitura passa sempre', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS'])
      expect(pedido(m, { origin: 'https://mal.example', cookie: 'sb=1' })).toBe(true);
  });

  it('POST, PUT, PATCH e DELETE da própria origem passam; de outra, não', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(pedido(m, { origin: SITE, cookie: 'sb=1' })).toBe(true);
      expect(pedido(m, { origin: 'https://mal.example', cookie: 'sb=1' })).toBe(false);
      // Origin "null" (iframe sandbox, redirecionamento) também é de fora.
      expect(pedido(m, { origin: 'null', cookie: 'sb=1' })).toBe(false);
    }
  });

  it('sem Origin, vale o Sec-Fetch-Site', () => {
    expect(pedido('POST', { 'sec-fetch-site': 'same-origin', cookie: 'sb=1' })).toBe(true);
    for (const s of ['same-site', 'cross-site', 'none'])
      expect(pedido('POST', { 'sec-fetch-site': s, cookie: 'sb=1' })).toBe(false);
  });

  it('Authorization (PWA, conector, cron) não depende de cookie e passa', () => {
    expect(pedido('POST', { authorization: 'Bearer x', origin: 'https://pwa.example' })).toBe(true);
    expect(pedido('POST', { authorization: 'Agent hk_x' })).toBe(true);
  });

  it('sem Origin nem Sec-Fetch-Site: passa só sem cookie e fora de /auth', () => {
    expect(pedido('POST')).toBe(true);
    expect(pedido('POST', { cookie: 'sb=1' })).toBe(false);
    expect(pedido('POST', {}, '/auth/sessao')).toBe(false);
  });
});

describe('CSP', () => {
  const csp = politicaDeConteudo({
    nonce: 'abc',
    urlSupabase: 'https://ref.supabase.co/',
    desenvolvimento: false,
  });
  const diretiva = (nome: string) =>
    csp
      .split('; ')
      .find((d) => d.split(' ')[0] === nome)
      ?.split(' ')
      .slice(1);

  it('script só com nonce, sem inline nem eval em produção', () => {
    expect(diretiva('script-src')).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(csp).not.toContain('unsafe-eval');
    expect(diretiva('script-src')).not.toContain("'unsafe-inline'");
  });

  it('não é emoldurado, sem plugin, base e formulário só da própria origem', () => {
    expect(diretiva('frame-ancestors')).toEqual(["'none'"]);
    expect(diretiva('object-src')).toEqual(["'none'"]);
    expect(diretiva('base-uri')).toEqual(["'self'"]);
    expect(diretiva('form-action')).toEqual(["'self'"]);
    expect(diretiva('upgrade-insecure-requests')).toEqual([]);
  });

  it('o Supabase entra só onde o navegador fala com ele (login e URL assinada)', () => {
    expect(diretiva('connect-src')).toEqual(["'self'", 'https://ref.supabase.co']);
    expect(diretiva('img-src')).toContain('https://ref.supabase.co');
    expect(diretiva('default-src')).toEqual(["'self'"]);
  });

  it('no dev, eval liberado (React Refresh) e sem upgrade-insecure-requests', () => {
    const dev = politicaDeConteudo({ nonce: 'n', urlSupabase: undefined, desenvolvimento: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('nonce novo a cada requisição, com 128 bits', () => {
    const a = novoNonce();
    expect(a).not.toBe(novoNonce());
    expect(atob(a)).toHaveLength(16);
  });
});

describe('cabeçalhos fixos (next.config.ts)', () => {
  it('toda resposta leva HSTS, nosniff, referrer, frame e permissões', async () => {
    const regras = (await config.headers?.()) ?? [];
    expect(regras.map((r) => r.source)).toEqual(['/:path*']);
    const nomes = (regras[0]?.headers ?? []).map((h) => h.key);
    for (const n of [
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Permissions-Policy',
    ])
      expect(nomes).toContain(n);
  });

  it('HSTS de dois anos com subdomínios, fora do dev', () => {
    const hsts = cabecalhosFixos(false).find((h) => h.key === 'Strict-Transport-Security');
    expect(hsts?.value).toBe('max-age=63072000; includeSubDomains');
    expect(cabecalhosFixos(true).some((h) => h.key === 'Strict-Transport-Security')).toBe(false);
  });
});

describe('proxy', () => {
  it('recusa com 403 e código a mudança de estado de outro site', async () => {
    const r = await proxy(
      new NextRequest(`${SITE}/api/v1/hoteis`, {
        method: 'POST',
        headers: { origin: 'https://mal.example', cookie: 'sb-x-auth-token=1' },
      }),
    );
    expect(r.status).toBe(403);
    expect(((await r.json()) as { erro: { codigo: string } }).erro.codigo).toBe('origem_recusada');
  });

  it('página ganha CSP com nonce; API, a política fechada', async () => {
    const pagina = await proxy(new NextRequest(`${SITE}/login`));
    expect(pagina.headers.get('content-security-policy')).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    const api = await proxy(new NextRequest(`${SITE}/api/v1/sessao`));
    expect(api.headers.get('content-security-policy')).toBe(POLITICA_DA_API);
    expect(api.headers.get('cache-control')).toBe('no-store');
  });
});

describe('cookie de sessão', () => {
  it('HttpOnly e SameSite=Lax; Secure em produção', () => {
    expect(opcoesDoCookieDeSessao()).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const r = comCookies(new Response(null), [
      {
        name: 'sb-ref-auth-token',
        value: 'v',
        options: { ...opcoesDoCookieDeSessao(), secure: true },
      },
    ]);
    const cookie = r.headers.getSetCookie()[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
  });
});
