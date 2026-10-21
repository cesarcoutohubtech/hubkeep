// Monta o Contexto (usuário + tenant) de uma requisição.
//
//   usuário: do access token, VERIFICADO pela assinatura (identidade.ts). O
//            token vem do cabeçalho Authorization: Bearer (PWA do técnico) ou
//            do cookie de sessão do @supabase/ssr (telas web). Nunca do corpo.
//   tenant:  do cabeçalho x-hubkeep-tenant ou do cookie hk_tenant. Não precisa
//            ser confiável: o banco só aceita tenant de que o usuário é membro
//            ativo (authz.tenant_id()), e um tenant forjado não mostra nada.
//   segundo fator (SP1, ADR-049): com a sessão em aal1, as atribuições do
//            usuário no tenant são lidas, e quem tem papel que exige o segundo
//            fator recebe 403 segundo_fator_obrigatorio, em toda rota que pede
//            o contexto. Com aal2, não há leitura a mais.
import { TokenInvalido, relogioDoSistema } from '@hubkeep/aplicacao';
import type { Contexto } from '@hubkeep/db';
import {
  type Atribuicao,
  type NivelDaSessao,
  exigeSegundoFator,
  exigirNivelDaSessao,
} from '@hubkeep/dominio';
import { createServerClient } from '@supabase/ssr';
import {
  atribuicoesDoUsuario,
  chavePublicaSupabase,
  urlSupabase,
  verificadorDeToken,
} from './composicao';
import { ErroHttp } from './erro-http';
import { cookiesDaRequisicao as cookies } from './sessao-supabase';

export const CABECALHO_TENANT = 'x-hubkeep-tenant';
export const COOKIE_TENANT = 'hk_tenant';

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

export interface DependenciasDoPortao {
  atribuicoes: (ctx: Contexto) => Promise<readonly Atribuicao[]>;
  agora: () => Date;
}

const PORTAO: DependenciasDoPortao = {
  atribuicoes: atribuicoesDoUsuario,
  agora: () => relogioDoSistema.agora(),
};

/** O portão do segundo fator (SP1): em aal1, recusa quem tem papel que o exige. */
export async function exigirSegundoFatorNoContexto(
  ctx: Contexto,
  nivel: NivelDaSessao,
  deps: DependenciasDoPortao = PORTAO,
): Promise<void> {
  if (nivel === 'aal2') return;
  exigirNivelDaSessao(nivel, await deps.atribuicoes(ctx), deps.agora());
}

/** Algum grupo do token tem papel do usuário que exige o segundo fator (SP1). */
export async function exigeSegundoFatorNoUsuario(
  usuario: { usuarioId: string; tenantsSugeridos: readonly string[] },
  deps: DependenciasDoPortao = PORTAO,
): Promise<boolean> {
  for (const tenantId of usuario.tenantsSugeridos) {
    const atribuicoes = await deps.atribuicoes({ usuarioId: usuario.usuarioId, tenantId });
    if (exigeSegundoFator(atribuicoes, deps.agora())) return true;
  }
  return false;
}

export async function resolverContexto(req: Request): Promise<Contexto> {
  const usuario = await usuarioDaRequisicao(req);
  const tenantId = tenantDaRequisicao(req);
  if (!tenantId) {
    throw new ErroHttp(400, 'tenant_ausente', { cabecalho: CABECALHO_TENANT });
  }
  const ctx = { usuarioId: usuario.usuarioId, tenantId };
  await exigirSegundoFatorNoContexto(ctx, usuario.nivel);
  return ctx;
}
