// P1a: o proxy não vai ao Auth em todo pedido (só para renovar o token que
// está para vencer) e o Server-Timing mostra o tempo do proxy, da sessão, da
// verificação do usuário e da rota.
import { RespostaDeConvite } from '@hubkeep/contratos';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '../src/proxy';
import { type Dependencias, rota } from '../src/servidor/http';
import { metrica, tempoDoProxy } from '../src/servidor/tempo';

const SITE = 'https://app.hubkeep.test';
const SUPABASE = 'https://abcdefgh.supabase.co';
const COOKIE = 'sb-abcdefgh-auth-token';
const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT = '10000000-0000-4000-8000-000000000001';
const SERVER_TIMING = /^proxy;dur=[\d.]+, sessao;dur=[\d.]+$/;

const base64url = (texto: string) => Buffer.from(texto).toString('base64url');
const jwtFalso = (exp: number) =>
  `${base64url('{"alg":"ES256"}')}.${base64url(JSON.stringify({ sub: USUARIO, exp }))}.x`;

/** Cookie de sessão do @supabase/ssr com o access token vencendo em `segundos`. */
function cookieDeSessao(segundos: number) {
  const expiraEm = Math.floor(Date.now() / 1000) + segundos;
  const sessao = {
    access_token: jwtFalso(expiraEm),
    refresh_token: 'refresh-antigo',
    token_type: 'bearer',
    expires_in: segundos,
    expires_at: expiraEm,
    user: { id: USUARIO, aud: 'authenticated', role: 'authenticated' },
  };
  return `${COOKIE}=base64-${base64url(JSON.stringify(sessao))}`;
}

describe('proxy sem ida ao Auth (P1a)', () => {
  const chamadas: string[] = [];
  beforeEach(() => {
    chamadas.length = 0;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: RequestInfo | URL) => {
        chamadas.push(String(entrada instanceof Request ? entrada.url : entrada));
        const expiraEm = Math.floor(Date.now() / 1000) + 3600;
        return Response.json({
          access_token: jwtFalso(expiraEm),
          refresh_token: 'refresh-novo',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: expiraEm,
          user: { id: USUARIO, aud: 'authenticated', role: 'authenticated' },
        });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('com o token válido, nenhum pedido ao Auth e nenhum cookie novo', async () => {
    const r = await proxy(
      new NextRequest(`${SITE}/chamados`, { headers: { cookie: cookieDeSessao(3600) } }),
    );
    expect(chamadas).toEqual([]);
    expect(r.headers.getSetCookie()).toEqual([]);
  });

  it('com o token para vencer, renova pelo refresh token e devolve o cookie novo', async () => {
    const r = await proxy(
      new NextRequest(`${SITE}/chamados`, { headers: { cookie: cookieDeSessao(5) } }),
    );
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain('/auth/v1/token?grant_type=refresh_token');
    const gravado = r.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
    expect(gravado).toMatch(/HttpOnly/i);
  });

  it('sem sessão, nenhum pedido ao Auth', async () => {
    await proxy(new NextRequest(`${SITE}/login`));
    expect(chamadas).toEqual([]);
  });
});

describe('Server-Timing (P1a)', () => {
  it('página: o proxy põe o tempo dele na resposta', async () => {
    const r = await proxy(new NextRequest(`${SITE}/login`));
    expect(r.headers.get('server-timing')).toMatch(SERVER_TIMING);
  });

  it('API: o proxy passa o tempo para a rota e regrava o que o navegador mandou', async () => {
    const r = await proxy(
      new NextRequest(`${SITE}/api/v1/sessao`, {
        headers: { 'x-hk-tempo-proxy': 'proxy;dur=0, falso;dur=1' },
      }),
    );
    expect(r.headers.get('server-timing')).toBeNull();
    expect(r.headers.get('x-middleware-request-x-hk-tempo-proxy')).toMatch(SERVER_TIMING);
  });

  it('a rota junta o tempo do proxy ao da verificação do usuário e ao total', async () => {
    const deps: Partial<Dependencias> = {
      resolverContexto: async () => ({ usuarioId: USUARIO, tenantId: TENANT }),
      registrar: () => undefined,
      relatar: () => undefined,
    };
    const get = rota(
      'teste.ler',
      async (r) => {
        await r.contexto();
        return r.responder(200, RespostaDeConvite, { usuarioId: USUARIO });
      },
      deps,
    );
    const comProxy = await get(
      new Request('http://127.0.0.1/api/v1/teste', {
        headers: { 'x-hk-tempo-proxy': 'proxy;dur=1.5, sessao;dur=0.2' },
      }),
    );
    expect(comProxy.headers.get('server-timing')).toMatch(
      /^proxy;dur=1\.5, sessao;dur=0\.2, auth;dur=[\d.]+, app;dur=[\d.]+$/,
    );
    const semProxy = await get(new Request('http://127.0.0.1/api/v1/teste'));
    expect(semProxy.headers.get('server-timing')).toMatch(/^auth;dur=[\d.]+, app;dur=[\d.]+$/);
  });

  it('valor fora do formato não entra no cabeçalho', () => {
    expect(metrica('app', 12.345)).toBe('app;dur=12.3');
    expect(metrica('app', -1)).toBe('app;dur=0');
    expect(tempoDoProxy(new Headers({ 'x-hk-tempo-proxy': 'proxy;dur=1, sessao;dur=2.5' }))).toBe(
      'proxy;dur=1, sessao;dur=2.5',
    );
    for (const ruim of ['proxy;dur=1;desc="x"', 'proxy;dur=1,\r\nset-cookie: a=b', ''])
      expect(tempoDoProxy(new Headers({ 'x-hk-tempo-proxy': ruim.replace(/[\r\n]/g, '') }))).toBe(
        null,
      );
  });
});
