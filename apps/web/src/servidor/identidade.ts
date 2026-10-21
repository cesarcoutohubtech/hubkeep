// Validação do access token do Supabase Auth NO SERVIDOR, pelas chaves
// públicas do projeto (JWKS). A sessão que o @supabase/ssr lê do cookie é só
// um lugar de onde tirar o token: o conteúdo do cookie é do navegador e não
// prova nada até a assinatura ser conferida aqui.
import { TokenInvalido, type VerificadorDeToken } from '@hubkeep/aplicacao';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param urlSupabase  URL do projeto (ex.: https://<ref>.supabase.co). O JWKS e
 *                     o emissor esperado derivam dela.
 */
export function criarVerificadorJwks(urlSupabase: string): VerificadorDeToken {
  const base = urlSupabase.replace(/\/+$/, '');
  const emissor = `${base}/auth/v1`;
  // createRemoteJWKSet guarda as chaves em cache e rebusca quando aparece um
  // `kid` desconhecido (rotação de chave no painel do Supabase).
  const jwks = createRemoteJWKSet(new URL(`${emissor}/.well-known/jwks.json`));

  return {
    async verificar(token) {
      if (!token) throw new TokenInvalido('ausente');
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: emissor,
          audience: 'authenticated',
          // Só chave assimétrica: um token HS256 (segredo compartilhado legado)
          // é recusado mesmo que o projeto ainda o aceitasse.
          algorithms: ['ES256', 'RS256'],
        });
        if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
          throw new TokenInvalido('sub não é um UUID');
        }
        if (payload['role'] !== 'authenticated') throw new TokenInvalido('papel não autenticado');
        const email = typeof payload['email'] === 'string' ? payload['email'] : null;
        const meta = payload['app_metadata'] as { hk_tenants?: unknown } | undefined;
        const tenantsSugeridos = Array.isArray(meta?.hk_tenants)
          ? meta.hk_tenants.filter((t): t is string => typeof t === 'string' && UUID.test(t))
          : [];
        // O nível da sessão (SP1, ADR-049): só aal2 vale como segundo fator.
        const nivel = payload['aal'] === 'aal2' ? 'aal2' : 'aal1';
        return { usuarioId: payload.sub, email, tenantsSugeridos, nivel };
      } catch (e) {
        if (e instanceof TokenInvalido) throw e;
        if (e instanceof errors.JWTExpired) throw new TokenInvalido('expirado');
        if (e instanceof errors.JOSEError) throw new TokenInvalido(e.code);
        throw e; // falha de rede ao buscar o JWKS etc.: não é culpa do token
      }
    },
  };
}
