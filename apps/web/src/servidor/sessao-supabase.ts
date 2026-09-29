// Cookie de sessão do Supabase no web (S1, ADR-032). A sessão (access e
// refresh token) mora em cookie HttpOnly, Secure (fora do dev) e SameSite=Lax:
// o JavaScript da página não a lê, então um XSS não a leva embora. Quem grava
// e renova o cookie é sempre o servidor: /auth/sessao (entrada), /auth/confirmar
// (convite), /auth/senha e o proxy.ts (renovação).
//
// Sem import da composição: o proxy.ts usa este módulo e não pode puxar o banco.
import {
  type CookieOptions,
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/ssr';

export interface CookieParaGravar {
  name: string;
  value: string;
  options: CookieOptions;
}

export function opcoesDoCookieDeSessao(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function cookiesDaRequisicao(req: Request): { name: string; value: string }[] {
  return parseCookieHeader(req.headers.get('cookie') ?? '').map((c) => ({
    name: c.name,
    value: c.value ?? '',
  }));
}

/**
 * Cliente do Auth que lê a sessão dos cookies da requisição (ou de nenhum, com
 * `req` nulo) e junta em `gravados` os cookies a devolver.
 */
export function clienteDeSessao(
  url: string,
  chavePublica: string,
  req: Request | null,
  gravados: CookieParaGravar[],
) {
  return createServerClient(url, chavePublica, {
    cookieOptions: opcoesDoCookieDeSessao(),
    cookies: {
      getAll: () => (req ? cookiesDaRequisicao(req) : []),
      setAll: (lista) => {
        gravados.push(...lista);
      },
    },
  });
}

/** Acrescenta os cookies à resposta, com as opções que o cliente do Auth passou. */
export function comCookies(resposta: Response, gravados: CookieParaGravar[]): Response {
  for (const { name, value, options } of gravados) {
    resposta.headers.append('set-cookie', serializeCookieHeader(name, value, options));
  }
  return resposta;
}
