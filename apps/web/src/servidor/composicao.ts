// Raiz de composição do servidor: cria uma vez, por instância de função, o
// acesso ao banco, o verificador de token e o provedor de convite. Único ponto
// do app que lê as variáveis de ambiente do servidor.
import { criarProvedorConviteSupabase } from '@hubkeep/auth-admin';
import type { ProvedorDeConvite, VerificadorDeToken } from '@hubkeep/aplicacao';
import { type AcessoBanco, criarAcessoBanco } from '@hubkeep/db';
import { criarVerificadorJwks } from './identidade';

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida.`);
  return v;
}

export const urlSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_URL');
export const chavePublicaSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

// TLS para o pooler do Supabase; a CI conecta ao Postgres do runner sem TLS.
const ssl = () => process.env.HK_BANCO_SEM_TLS !== '1';

let banco: Promise<AcessoBanco> | undefined;
export function acessoBanco(): Promise<AcessoBanco> {
  // A fábrica é assíncrona (guarda de papel, ADR-016). Se falhar, o próximo
  // pedido tenta de novo em vez de ficar preso a uma Promise rejeitada.
  banco ??= criarAcessoBanco({
    app: { url: exigirEnv('DATABASE_URL_APP'), ssl: ssl() },
  }).catch((e: unknown) => {
    banco = undefined;
    throw e;
  });
  return banco;
}

let verificador: VerificadorDeToken | undefined;
export const verificadorDeToken = () => (verificador ??= criarVerificadorJwks(urlSupabase()));

let convites: ProvedorDeConvite | undefined;
export const provedorDeConvite = () =>
  (convites ??= criarProvedorConviteSupabase({ url: urlSupabase() }));
