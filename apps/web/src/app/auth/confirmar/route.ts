// GET /auth/confirmar?token_hash=...&type=invite|recovery — aceite do convite
// (ADR-014) e link da recuperação de senha (C9 da comunicação da 1c).
// O link do e-mail traz o token_hash; aqui ele é trocado por uma sessão, gravada
// nos cookies do @supabase/ssr (HttpOnly). O aceite NÃO grava nada nas tabelas do HubKeep:
// o membro já existe desde o convite. Depois, a pessoa define a senha.
//
// Requer o template de convite apontando para esta rota com {{ .TokenHash }}
// (supabase/templates/convite.html; no projeto de dev, configurado no painel).
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { chavePublicaSupabase, urlSupabase } from '../../../servidor/composicao';
import {
  type CookieParaGravar,
  clienteDeSessao,
  comCookies,
} from '../../../servidor/sessao-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Os tipos com modelo de e-mail do catálogo (supabase/templates): o convite e
// a recuperação de senha. Os dois levam a /definir-senha. O link mágico, sem
// modelo, cai no login com erro.
const TIPOS_ACEITOS: readonly EmailOtpType[] = ['invite', 'recovery'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const tipo = url.searchParams.get('type') as EmailOtpType | null;
  const destino = new URL('/definir-senha', url.origin);
  const falha = new URL('/login?erro=link_invalido', url.origin);

  if (!tokenHash || !tipo || !TIPOS_ACEITOS.includes(tipo)) return NextResponse.redirect(falha);

  // Cookie HttpOnly (servidor/sessao-supabase.ts, S1).
  const gravados: CookieParaGravar[] = [];
  const supabase = clienteDeSessao(urlSupabase(), chavePublicaSupabase(), req, gravados);
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
  return error
    ? NextResponse.redirect(falha)
    : comCookies(NextResponse.redirect(destino), gravados);
}
