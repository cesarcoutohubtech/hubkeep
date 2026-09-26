// Monta o Contexto (usuário + tenant) de uma requisição.
//
//   usuário: do access token, VERIFICADO pela assinatura (identidade.ts). O
//            token vem do cabeçalho Authorization: Bearer (PWA do técnico) ou
//            do cookie de sessão do @supabase/ssr (telas web). Nunca do corpo.
//   tenant:  do cabeçalho x-hubkeep-tenant ou do cookie hk_tenant. Não precisa
//            ser confiável: o banco só aceita tenant de que o usuário é membro
//            ativo (authz.tenant_id()), e um tenant forjado não mostra nada.
import { TokenInvalido } from '@hubkeep/aplicacao';
import type { Contexto } from '@hubkeep/db';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { chavePublicaSupabase, urlSupabase, verificadorDeToken } from './composicao';
import { ErroHttp } from './erro-http';

export const CABECALHO_TENANT = 'x-hubkeep-tenant';
export const COOKIE_TENANT = 'hk_tenant';

function cookies(req: Request) {
  return parseCookieHeader(req.headers.get('cookie') ?? '').map((c) => ({
    name: c.name,
    value: c.value ?? '',
  }));
}

/** Access token da requisição, sem validar (a validação é em resolverContexto). */
async function tokenDaRequisicao(req: Request): Promise<string | null> {
  const autorizacao = req.headers.get('authorization');
  if (autorizacao) {
    const [esquema, token] = autorizacao.split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      throw new ErroHttp(401, 'nao_autenticado', { motivo: 'cabecalho_malformado' });
    }
    return token;
  }
  // Só leitura do cookie: renovar a sessão é trabalho do proxy.ts. O
  // getSession() aqui NÃO autentica — ele só devolve o que está no cookie.
  const supabase = createServerClient(urlSupabase(), chavePublicaSupabase(), {
    cookies: { getAll: () => cookies(req), setAll: () => undefined },
  });
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function usuarioDaRequisicao(req: Request) {
  const token = await tokenDaRequisicao(req);
  if (!token) throw new ErroHttp(401, 'nao_autenticado', { motivo: 'sessao_ausente' });
  try {
    return await verificadorDeToken().verificar(token);
  } catch (e) {
    // O motivo detalhado (assinatura, expiração) fica fora da resposta.
    if (e instanceof TokenInvalido) {
      throw new ErroHttp(401, 'nao_autenticado', { motivo: 'token_invalido' });
    }
    throw e;
  }
}

export function tenantDaRequisicao(req: Request): string | null {
  return (
    req.headers.get(CABECALHO_TENANT) ??
    cookies(req).find((c) => c.name === COOKIE_TENANT)?.value ??
    null
  );
}

export async function resolverContexto(req: Request): Promise<Contexto> {
  const usuario = await usuarioDaRequisicao(req);
  const tenantId = tenantDaRequisicao(req);
  if (!tenantId) {
    throw new ErroHttp(400, 'tenant_ausente', { cabecalho: CABECALHO_TENANT });
  }
  return { usuarioId: usuario.usuarioId, tenantId };
}
