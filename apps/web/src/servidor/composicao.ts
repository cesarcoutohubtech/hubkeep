// Raiz de composição do servidor: cria uma vez, por instância de função, o
// acesso ao banco, o verificador de token e os casos de uso. Único ponto do app
// que lê as variáveis de ambiente do servidor.
import { criarAdministracaoDoAuth } from '@hubkeep/auth-admin';
import {
  type CasoDeUsoDeConvites,
  type CasosDeUsoDePapeis,
  type Manipulador,
  type VerificadorDeToken,
  criarCasoDeUsoDeConvites,
  criarCasosDeUsoDePapeis,
  criarManipuladoresDeEventos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  type ResultadoOutbox,
  criarAcessoBanco,
  criarPortasDeAplicacao,
  processarOutbox,
} from '@hubkeep/db';
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

/** Memoiza uma Promise, sem ficar preso a ela se rejeitar (o próximo pedido tenta de novo). */
function memo<T>(criar: () => Promise<T>): () => Promise<T> {
  let atual: Promise<T> | undefined;
  return () => {
    atual ??= criar().catch((e: unknown) => {
      atual = undefined;
      throw e;
    });
    return atual;
  };
}

// A fábrica é assíncrona: confere o papel de cada pool (guarda de papel, ADR-016).
export const acessoBanco = memo<AcessoBanco>(() =>
  criarAcessoBanco({ app: { url: exigirEnv('DATABASE_URL_APP'), ssl: ssl() } }),
);
const acessoBancoDoWorker = memo<AcessoBanco>(() =>
  criarAcessoBanco({ worker: { url: exigirEnv('DATABASE_URL_WORKER'), ssl: ssl() } }),
);

let auth: ReturnType<typeof criarAdministracaoDoAuth> | undefined;
const administracaoDoAuth = () => (auth ??= criarAdministracaoDoAuth({ url: urlSupabase() }));

export const casosDeUsoDePapeis = memo<CasosDeUsoDePapeis>(async () =>
  criarCasosDeUsoDePapeis({
    ...criarPortasDeAplicacao(await acessoBanco()),
    relogio: relogioDoSistema,
  }),
);

export const casoDeUsoDeConvites = memo<CasoDeUsoDeConvites>(async () =>
  criarCasoDeUsoDeConvites({
    papeis: await casosDeUsoDePapeis(),
    convites: criarPortasDeAplicacao(await acessoBanco()).convites,
    identidade: administracaoDoAuth().identidade,
  }),
);

let manipuladores: Record<string, Manipulador> | undefined;
/**
 * Processa o outbox de um tenant (hk_worker). A rota de cron que chama isto
 * para todos os tenants, com CRON_SECRET, é da F0-09.
 */
export async function processarOutboxDoTenant(tenantId: string): Promise<ResultadoOutbox> {
  manipuladores ??= criarManipuladoresDeEventos(administracaoDoAuth());
  return processarOutbox(await acessoBancoDoWorker(), tenantId, manipuladores);
}

let verificador: VerificadorDeToken | undefined;
export const verificadorDeToken = () => (verificador ??= criarVerificadorJwks(urlSupabase()));
