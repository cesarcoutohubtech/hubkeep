'use client';
// Entrada, saída e senha nas telas do web (S1, ADR-032). A página nunca guarda
// token: o login vai direto ao Auth com a sessão só em memória, e os tokens
// seguem na hora para /auth/sessao, que os grava em cookie HttpOnly. Nenhuma
// tabela do HubKeep é lida daqui — a Data API está fechada (ADR-002).
//
// O cliente do Supabase é criado uma vez só por página: criar um a cada
// entrada deixava várias instâncias do GoTrueClient vivas ("Multiple
// GoTrueClient instances"), disputando o mesmo armazenamento.
//
// Segundo fator (SP1, ADR-049), ainda com a sessão em memória:
//   - quem já cadastrou o TOTP digita o código antes de a sessão ir para o
//     cookie, com ou sem papel que exija;
//   - quem não cadastrou e tem papel que exige recebe 403
//     segundo_fator_obrigatorio de /auth/sessao: o login cadastra o fator (QR e
//     segredo) e pede o primeiro código.
import { type Session, type SupabaseClient, createClient } from '@supabase/supabase-js';

const JSON_CT = { 'content-type': 'application/json' };

let cliente: SupabaseClient | undefined;
const clienteDoAuth = () =>
  (cliente ??= createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));

export type ResultadoDaEntrada =
  | { tipo: 'ok' }
  | { tipo: 'credenciais' }
  /** Já tem o TOTP: falta o código do aplicativo. */
  | { tipo: 'codigo' }
  /** O papel exige o segundo fator e ainda não há um: o QR e o segredo do cadastro. */
  | { tipo: 'cadastro'; qr: string; segredo: string }
  | { tipo: 'falha' };

/** O fator do código pedido agora (o cadastrado ou o que está sendo cadastrado). */
let fatorEmCurso: string | null = null;

async function gravarSessao(sessao: Session): Promise<Response | null> {
  return fetch('/auth/sessao', {
    method: 'POST',
    headers: JSON_CT,
    body: JSON.stringify({
      accessToken: sessao.access_token,
      refreshToken: sessao.refresh_token,
    }),
  }).catch(() => null);
}

const pedeSegundoFator = async (r: Response) =>
  r.status === 403 &&
  ((await r.json().catch(() => null)) as { erro?: { codigo?: string } } | null)?.erro?.codigo ===
    'segundo_fator_obrigatorio';

/** Cadastra um TOTP novo, depois de tirar os cadastros que ficaram sem verificar. */
async function iniciarCadastro(): Promise<ResultadoDaEntrada> {
  const mfa = clienteDoAuth().auth.mfa;
  const { data: fatores } = await mfa.listFactors();
  for (const f of fatores?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified')
      await mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await mfa.enroll({ factorType: 'totp' });
  if (error || !data) return { tipo: 'falha' };
  fatorEmCurso = data.id;
  return { tipo: 'cadastro', qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function entrar(email: string, senha: string): Promise<ResultadoDaEntrada> {
  fatorEmCurso = null;
  const auth = clienteDoAuth().auth;
  const { data, error } = await auth.signInWithPassword({ email, password: senha });
  if (error || !data.session) return { tipo: 'credenciais' };
  const { data: fatores } = await auth.mfa.listFactors();
  const cadastrado = fatores?.totp[0];
  if (cadastrado) {
    fatorEmCurso = cadastrado.id;
    return { tipo: 'codigo' };
  }
  const r = await gravarSessao(data.session);
  if (r?.ok) return { tipo: 'ok' };
  if (r && (await pedeSegundoFator(r))) return iniciarCadastro();
  return { tipo: 'falha' };
}

/** Verifica o código do aplicativo e grava a sessão, já em aal2. */
export async function confirmarCodigo(codigo: string): Promise<'ok' | 'codigo_invalido' | 'falha'> {
  if (!fatorEmCurso) return 'falha';
  const auth = clienteDoAuth().auth;
  const { error } = await auth.mfa.challengeAndVerify({ factorId: fatorEmCurso, code: codigo });
  if (error) return 'codigo_invalido';
  const { data } = await auth.getSession();
  if (!data.session) return 'falha';
  const r = await gravarSessao(data.session);
  return r?.ok ? 'ok' : 'falha';
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
