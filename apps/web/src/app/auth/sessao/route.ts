// POST /auth/sessao — entrada no web (S1, ADR-032). O login acontece no
// navegador, direto no Auth (o limite de tentativas do Supabase conta por IP de
// quem tenta, não pelo IP do servidor), com a sessão só em memória. Os tokens
// vêm para cá, o access token é conferido pela assinatura (JWKS) e a sessão
// vai para o cookie HttpOnly: a página não guarda nem lê token.
//
// Segundo fator (SP1, ADR-049): com o token em aal1, quem tem papel que exige o
// segundo fator em algum dos grupos do token recebe 403
// segundo_fator_obrigatorio, sem cookie. O login, que ainda tem a sessão em
// memória, pede o código (ou o cadastro do fator) e manda os tokens em aal2.
//
// DELETE /auth/sessao — saída: encerra a sessão deste navegador no Auth
// (escopo local; o PWA do mesmo usuário segue) e apaga os cookies.
//
// Mudam estado com cookie: o proxy.ts confere a origem (CSRF) antes.
import { TokenInvalido } from '@hubkeep/aplicacao';
import { CODIGOS_HTTP, PedidoDeSessao } from '@hubkeep/contratos';
import {
  chavePublicaSupabase,
  urlSupabase,
  verificadorDeToken,
} from '../../../servidor/composicao';
import { exigirSegundoFatorNoContexto } from '../../../servidor/contexto';
import { ErroHttp, rota } from '../../../servidor/http';
import {
  type CookieParaGravar,
  clienteDeSessao,
  comCookies,
} from '../../../servidor/sessao-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tokenInvalido = () =>
  new ErroHttp(401, CODIGOS_HTTP.naoAutenticado, { motivo: 'token_invalido' });

export const POST = rota('auth.sessao.criar', async (r) => {
  const pedido = await r.corpo(PedidoDeSessao, { limiteBytes: 16_384 });
  let usuario;
  try {
    usuario = await verificadorDeToken().verificar(pedido.accessToken);
  } catch (e) {
    if (e instanceof TokenInvalido) throw tokenInvalido();
    throw e;
  }
  for (const tenantId of usuario.tenantsSugeridos) {
    await exigirSegundoFatorNoContexto({ usuarioId: usuario.usuarioId, tenantId }, usuario.nivel);
  }
  const gravados: CookieParaGravar[] = [];
  const supabase = clienteDeSessao(urlSupabase(), chavePublicaSupabase(), null, gravados);
  const { error } = await supabase.auth.setSession({
    access_token: pedido.accessToken,
    refresh_token: pedido.refreshToken,
  });
  if (error) throw tokenInvalido();
  return comCookies(new Response(null, { status: 204 }), gravados);
});

export const DELETE = rota('auth.sessao.encerrar', async (r) => {
  const gravados: CookieParaGravar[] = [];
  const supabase = clienteDeSessao(urlSupabase(), chavePublicaSupabase(), r.req, gravados);
  // Mesmo com o Auth fora do ar ou a sessão já vencida, os cookies saem.
  await supabase.auth.signOut({ scope: 'local' });
  return comCookies(new Response(null, { status: 204 }), gravados);
});
