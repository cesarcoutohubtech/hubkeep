// Sessão do técnico: login no Supabase Auth com a chave pública (só
// autentica; o PWA não lê tabela nenhuma). A sessão fica no aparelho, para o
// app abrir sem rede; o token é renovado pelo supabase-js quando a rede volta.
import { type Session, type SupabaseClient, createClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave)
    throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias.');
  cliente ??= createClient(url, chave, { auth: { persistSession: true, autoRefreshToken: true } });
  return cliente;
}

const GUARDADO = 'hk_tenant';

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(GUARDADO);
  } catch {
    return null;
  }
}

/** Tenant ativo: o escolhido antes, ou o primeiro sugerido pelo app_metadata assinado. */
export function tenantDaSessao(sessao: Session | null): string | null {
  const guardado = lerGuardado();
  const sugeridos: unknown = sessao?.user.app_metadata['hk_tenants'];
  const lista = Array.isArray(sugeridos)
    ? sugeridos.filter((t): t is string => typeof t === 'string')
    : [];
  const tenant = guardado && lista.includes(guardado) ? guardado : (lista[0] ?? null);
  try {
    if (tenant) localStorage.setItem(GUARDADO, tenant);
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
  return tenant;
}
