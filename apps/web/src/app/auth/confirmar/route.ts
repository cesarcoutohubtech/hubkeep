// GET /auth/confirmar?token_hash=...&type=invite — aceite do convite (ADR-014).
// O link do e-mail traz o token_hash; aqui ele é trocado por uma sessão, gravada
// nos cookies do @supabase/ssr. O aceite NÃO grava nada nas tabelas do HubKeep:
// o membro já existe desde o convite. Depois, a pessoa define a senha.
//
// Requer o template de convite apontando para esta rota com {{ .TokenHash }}
// (supabase/templates/convite.html; no projeto de dev, configurado no painel).
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { chavePublicaSupabase, urlSupabase } from '../../../servidor/composicao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIPOS_ACEITOS: readonly EmailOtpType[] = ['invite', 'magiclink', 'recovery'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const tipo = url.searchParams.get('type') as EmailOtpType | null;
  const destino = new URL(tipo === 'magiclink' ? '/' : '/definir-senha', url.origin);
  const falha = new URL('/login?erro=link_invalido', url.origin);

  if (!tokenHash || !tipo || !TIPOS_ACEITOS.includes(tipo)) return NextResponse.redirect(falha);

  const resposta = NextResponse.redirect(destino);
  const supabase = createServerClient(urlSupabase(), chavePublicaSupabase(), {
    cookies: {
      getAll: () =>
        parseCookieHeader(req.headers.get('cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        })),
      setAll: (lista) => {
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
  return error ? NextResponse.redirect(falha) : resposta;
}
