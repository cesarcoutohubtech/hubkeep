// POST /api/v1/auth/recuperar — o e-mail de recuperação de senha (C9 da
// comunicação da 1c). Pública: responde sempre 202, exista ou não a conta, e
// a falha do Auth só vai para o log, para a resposta não revelar quem tem
// cadastro. O Supabase envia o link (template supabase/templates/recuperacao.html)
// para /auth/confirmar, que só aceita URL da allow-list do projeto. O limite de
// envios é o do Auth (rate_limit.email_sent e o intervalo por e-mail).
import { PedidoDeRecuperacaoDeSenha } from '@hubkeep/contratos';
import { createClient } from '@supabase/supabase-js';
import { chavePublicaSupabase, urlSupabase } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function urlDeRetorno(req: Request): string {
  const base = process.env['HK_URL_SITE'] ?? new URL(req.url).origin;
  return `${base.replace(/\/+$/, '')}/auth/confirmar`;
}

export const POST = rota('auth.recuperar', async (r) => {
  const { email } = await r.corpo(PedidoDeRecuperacaoDeSenha, { limiteBytes: 1024 });
  const auth = createClient(urlSupabase(), chavePublicaSupabase(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth;
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo: urlDeRetorno(r.req) });
  // O erro do Auth (limite de envio, conta bloqueada) não traz o e-mail.
  if (error) r.registrarErro(error, {});
  return new Response(null, { status: 202 });
});
