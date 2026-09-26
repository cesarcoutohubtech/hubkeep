// Raiz de composição do servidor: cria uma vez, por instância de função, o
// acesso ao banco, o verificador de token e os casos de uso. Único ponto do app
// que lê as variáveis de ambiente do servidor.
import { criarAdministracaoDoAuth, criarArmazenamentoDeAnexos } from '@hubkeep/auth-admin';
import {
  type CasoDeUsoDeConvites,
  type CasosDeUsoDeAnexos,
  type CasosDeUsoDeIngestao,
  type CasosDeUsoDePapeis,
  type CasosDeUsoDePreferencias,
  type CasosDeUsoDeSincronizacao,
  type Manipulador,
  type VerificadorDeToken,
  criarCasoDeUsoDeConvites,
  criarCasosDeUsoDeAnexos,
  criarCasosDeUsoDeIngestao,
  criarCasosDeUsoDePapeis,
  criarCasosDeUsoDePreferencias,
  criarCasosDeUsoDeSincronizacao,
  criarManipuladoresDeEventos,
  relogioDoSistema,
} from '@hubkeep/aplicacao';
import {
  type AcessoBanco,
  type ResultadoOutbox,
  criarAcessoBanco,
  criarPortaEscopoDeAnexo,
  criarPortaOperacoesOffline,
  criarPortaPreferencias,
  criarPortasDeAplicacao,
  criarPortasDeIngestao,
  criptografiaDoServidor,
  novoId,
  processarOutbox,
  tlsDaConexao,
} from '@hubkeep/db';
import { criarVerificadorJwks } from './identidade';

function exigirEnv(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não está definida.`);
  return v;
}

export const urlSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_URL');
export const chavePublicaSupabase = () => exigirEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

// TLS para o pooler do Supabase. HK_BANCO_SEM_TLS=1 (a CI, no Postgres do
// runner) só vale com host local; com host remoto a inicialização falha.
const conexao = (nome: string) => {
  const url = exigirEnv(nome);
  return { url, ssl: tlsDaConexao(url, process.env.HK_BANCO_SEM_TLS === '1') };
};

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
  criarAcessoBanco({ app: conexao('DATABASE_URL_APP') }),
);
const acessoBancoDoWorker = memo<AcessoBanco>(() =>
  criarAcessoBanco({ worker: conexao('DATABASE_URL_WORKER') }),
);
// Só a rota de ingestão abre este pool (hk_ingestao, só staging; ADR-008).
const acessoBancoDaIngestao = memo<AcessoBanco>(() =>
  criarAcessoBanco({ ingestao: conexao('DATABASE_URL_INGESTAO') }),
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

/** Recebimento de lotes do agente: só o pool hk_ingestao (F0-08). */
export const recebimentoDeLotes = memo<Pick<CasosDeUsoDeIngestao, 'receberLote'>>(async () =>
  criarCasosDeUsoDeIngestao({
    ingestao: criarPortasDeIngestao(await acessoBancoDaIngestao()).ingestao,
    cripto: criptografiaDoServidor,
  }),
);

/** Criar e revogar credencial do agente, pelo Admin do grupo (hk_app). */
export const credenciaisDeAgente = memo<
  Pick<CasosDeUsoDeIngestao, 'criarCredencial' | 'revogarCredencial'>
>(async () => {
  const banco = await acessoBanco();
  return criarCasosDeUsoDeIngestao({
    credenciais: criarPortasDeIngestao(banco).credenciais,
    atribuicoes: criarPortasDeAplicacao(banco).atribuicoes,
    relogio: relogioDoSistema,
    cripto: criptografiaDoServidor,
  });
});

/** Promove as UHs do staging de um tenant (hk_worker); /api/cron/promocao chama para todos. */
export async function promoverUhsDoTenant(tenantId: string) {
  return criarCasosDeUsoDeIngestao({
    promocao: criarPortasDeIngestao(await acessoBancoDoWorker()).promocao,
  }).promoverUhs(tenantId);
}

/** Tenants para os jobs de cron (hk_worker). */
export async function tenantsDoSistema(): Promise<string[]> {
  return (await acessoBancoDoWorker()).listarTenants();
}
/** URLs assinadas de anexo (F0-10): escopo pela RLS, URL pelo auth-admin. */
export const casosDeUsoDeAnexos = memo<CasosDeUsoDeAnexos>(async () =>
  criarCasosDeUsoDeAnexos({
    escopo: criarPortaEscopoDeAnexo(await acessoBanco()),
    armazenamento: criarArmazenamentoDeAnexos({ url: urlSupabase() }),
    relogio: relogioDoSistema,
    novoId,
  }),
);

/** Idioma e região do próprio usuário (F0-10b), pelo hk_app. */
export const casosDeUsoDePreferencias = memo<CasosDeUsoDePreferencias>(async () =>
  criarCasosDeUsoDePreferencias({ preferencias: criarPortaPreferencias(await acessoBanco()) }),
);

/** Operações offline do PWA do técnico (F0-11, ADR-025), pelo hk_app. */
export const casosDeUsoDeSincronizacao = memo<CasosDeUsoDeSincronizacao>(async () =>
  criarCasosDeUsoDeSincronizacao({ operacoes: criarPortaOperacoesOffline(await acessoBanco()) }),
);

let manipuladores: Record<string, Manipulador> | undefined;
/** Processa o outbox de um tenant (hk_worker); a rota /api/cron/outbox chama para todos. */
export async function processarOutboxDoTenant(tenantId: string): Promise<ResultadoOutbox> {
  manipuladores ??= criarManipuladoresDeEventos(administracaoDoAuth());
  return processarOutbox(await acessoBancoDoWorker(), tenantId, manipuladores);
}

let verificador: VerificadorDeToken | undefined;
export const verificadorDeToken = () => (verificador ??= criarVerificadorJwks(urlSupabase()));
