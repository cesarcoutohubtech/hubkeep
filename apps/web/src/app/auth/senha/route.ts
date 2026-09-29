// POST /auth/senha — senha nova de quem está com sessão (depois do convite ou
// da recuperação; S1, ADR-032). A sessão está no cookie HttpOnly, que só o
// servidor lê; por isso a troca passa por aqui, e não pelo navegador.
// A política de senha é a do Auth (supabase/config.toml).
import { CODIGOS_HTTP, PedidoDeSenha } from '@hubkeep/contratos';
import { chavePublicaSupabase, urlSupabase } from '../../../servidor/composicao';
import { ErroHttp, rota } from '../../../servidor/http';
import {
  type CookieParaGravar,
  clienteDeSessao,
  comCookies,
} from '../../../servidor/sessao-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('auth.senha.definir', async (r) => {
  // O token do cookie é conferido pela assinatura antes de o Auth ser chamado.
  await r.usuario();
  const { senha } = await r.corpo(PedidoDeSenha, { limiteBytes: 1024 });
  const gravados: CookieParaGravar[] = [];
  const supabase = clienteDeSessao(urlSupabase(), chavePublicaSupabase(), r.req, gravados);
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    const semSessao = error.name === 'AuthSessionMissingError';
    throw semSessao
      ? new ErroHttp(401, CODIGOS_HTTP.naoAutenticado, { motivo: 'sessao_ausente' })
      : new ErroHttp(422, 'senha_recusada', {});
  }
  return comCookies(new Response(null, { status: 204 }), gravados);
});
