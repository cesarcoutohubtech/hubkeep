// Os fatores do próprio usuário (SP1, ADR-049, "Minha conta → Segurança"),
// pelo Auth com a sessão do cookie HttpOnly, como em /auth/senha: a página não
// guarda token. O token é conferido pela assinatura antes de o Auth ser
// chamado, e o cliente do Auth regrava o cookie quando a sessão muda.
import { CODIGOS_HTTP } from '@hubkeep/contratos';
import { chavePublicaSupabase, urlSupabase } from '../../../servidor/composicao';
import { ErroHttp } from '../../../servidor/erro-http';
import { type CookieParaGravar, clienteDeSessao } from '../../../servidor/sessao-supabase';

export function authDaSessao(req: Request) {
  const gravados: CookieParaGravar[] = [];
  const supabase = clienteDeSessao(urlSupabase(), chavePublicaSupabase(), req, gravados);
  return { mfa: supabase.auth.mfa, gravados };
}

/** O erro do Auth como a API responde: sem sessão é 401; o resto, o código pedido. */
export function erroDoAuth(error: { name?: string }, codigo: string, status = 422): ErroHttp {
  return error.name === 'AuthSessionMissingError'
    ? new ErroHttp(401, CODIGOS_HTTP.naoAutenticado, { motivo: 'sessao_ausente' })
    : new ErroHttp(status, codigo, {});
}
