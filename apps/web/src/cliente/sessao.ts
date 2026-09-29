'use client';
// Entrada, saída e senha nas telas do web (S1, ADR-032). A página nunca guarda
// token: o login vai direto ao Auth com a sessão só em memória, e os tokens
// seguem na hora para /auth/sessao, que os grava em cookie HttpOnly. Nenhuma
// tabela do HubKeep é lida daqui — a Data API está fechada (ADR-002).
import { createClient } from '@supabase/supabase-js';

const JSON_CT = { 'content-type': 'application/json' };

export async function entrar(email: string, senha: string): Promise<boolean> {
  const auth = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ).auth;
  const { data, error } = await auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return false;
  const r = await fetch('/auth/sessao', {
    method: 'POST',
    headers: JSON_CT,
    body: JSON.stringify({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    }),
  }).catch(() => null);
  return r?.ok ?? false;
}

export async function sair(): Promise<void> {
  await fetch('/auth/sessao', { method: 'DELETE' }).catch(() => null);
}

export async function definirSenha(senha: string): Promise<boolean> {
  const r = await fetch('/auth/senha', {
    method: 'POST',
    headers: JSON_CT,
    body: JSON.stringify({ senha }),
  }).catch(() => null);
  return r?.ok ?? false;
}
