// @hubkeep/auth-admin — o ÚNICO pacote que usa a secret key do Supabase
// (CLAUDE.md, regra 5). Ela serve para administrar o Auth (convites, a remoção
// do segundo fator e, só no dev e na CI, as contas dos dados de demonstração)
// e para emitir URL assinada
// do Storage (ADR-024), e nunca para ler ou gravar tabela de negócio. A chave é lida aqui dentro, da
// variável SUPABASE_SECRET_KEY: quem compõe o app não a manipula, e a CI
// (tests/secret-key-so-no-auth-admin.test.ts) falha se ela aparecer fora daqui.
//
// Importável só por apps/web/src/servidor (lint), para nunca entrar num bundle
// de navegador.
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type {
  AdministracaoDoSegundoFator,
  ArmazenamentoDeArquivos,
  EnvioDeConvite,
  ProvedorDeIdentidade,
} from '@hubkeep/aplicacao';

function clienteAdmin(url: string): SupabaseClient {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error('SUPABASE_SECRET_KEY não está definida (só o servidor a recebe).');
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const jaExiste = (e: { code?: string | undefined; status?: number | undefined } | null) =>
  e?.code === 'email_exists' || e?.status === 422;

// app_metadata só é gravável com a secret key e viaja assinado no JWT.
async function vincularTenant(
  admin: SupabaseClient,
  usuarioId: string,
  tenantId: string,
): Promise<void> {
  const atual = await admin.auth.admin.getUserById(usuarioId);
  if (atual.error || !atual.data.user) {
    throw new Error(`Vínculo de tenant: usuário não encontrado (${atual.error?.message ?? '?'}).`);
  }
  const meta = atual.data.user.app_metadata ?? {};
  const lista: unknown = meta['hk_tenants'];
  const tenants = new Set(Array.isArray(lista) ? lista.filter((t) => typeof t === 'string') : []);
  if (tenants.has(tenantId)) return;
  tenants.add(tenantId);
  const r = await admin.auth.admin.updateUserById(usuarioId, {
    app_metadata: { ...meta, hk_tenants: [...tenants] },
  });
  if (r.error) throw new Error(`Vínculo de tenant recusado: ${r.error.message}.`);
}

/**
 * Administração do Supabase Auth para o convite (ADR-018).
 *
 * - `identidade`: cria o usuário SEM e-mail e sem confirmação (admin.createUser
 *   nunca envia nada), remove na compensação, vincula o tenant no app_metadata.
 * - `envio`: envia o convite com o e-mail padrão do Supabase (dev, limite baixo).
 *   Chamado só pelo worker, depois do commit do acesso. Para SMTP próprio, outro
 *   adaptador de EnvioDeConvite gera o link aqui (generateLink) e entrega por
 *   um EnviadorDeEmail — sem tocar no caso de uso.
 */
export function criarAdministracaoDoAuth(opcoes: { url: string }): {
  identidade: ProvedorDeIdentidade;
  envio: EnvioDeConvite;
} {
  const admin = clienteAdmin(opcoes.url);

  const identidade: ProvedorDeIdentidade = {
    async garantirUsuario({ email, nome, tenantId, nomeTenant }) {
      const criar = () =>
        admin.auth.admin.createUser({
          email,
          email_confirm: false,
          // O template do convite usa {{ .Data.nome }} e {{ .Data.tenant }}.
          user_metadata: { nome, tenant: nomeTenant },
          app_metadata: { hk_tenants: [tenantId] },
        });
      let criado = await criar();
      // Convite simultâneo para o mesmo e-mail: os dois pedidos passam pela
      // checagem de e-mail do Auth e o banco dele recusa o segundo com erro
      // genérico, não com email_exists. Uma única nova tentativa devolve
      // email_exists e cai no caminho de sempre, abaixo. Nenhum outro erro é
      // repetido. O casamento é pelo TEXTO da mensagem do Supabase: se esse
      // texto mudar, a nova tentativa deixa de acontecer e o convite perdedor
      // volta a receber 500 (falha segura, sem acesso a mais).
      if (
        criado.error?.status === 500 &&
        criado.error.message === 'Database error creating new user'
      ) {
        criado = await criar();
      }
      if (!criado.error && criado.data.user) {
        return { usuarioId: criado.data.user.id, criadoAgora: true };
      }
      if (jaExiste(criado.error)) {
        // generateLink não envia e-mail; aqui só serve para obter o id de quem existe.
        const existente = await admin.auth.admin.generateLink({ type: 'magiclink', email });
        if (existente.data.user) return { usuarioId: existente.data.user.id, criadoAgora: false };
        throw new Error(
          `Identidade: usuário existente sem id (${existente.error?.message ?? '?'}).`,
        );
      }
      throw new Error(
        `Identidade recusada pelo provedor: ${criado.error?.message ?? 'sem usuário'} ` +
          `(status ${criado.error?.status ?? '?'}, code ${criado.error?.code ?? '?'}).`,
      );
    },

    async removerUsuario(usuarioId) {
      const r = await admin.auth.admin.deleteUser(usuarioId);
      if (r.error) throw new Error(`Compensação: não removeu o usuário (${r.error.message}).`);
    },

    vincularTenant: (usuarioId, tenantId) => vincularTenant(admin, usuarioId, tenantId),
  };

  const envio: EnvioDeConvite = {
    async enviarConvite({ email, redirecionarPara }) {
      // Para quem ainda não confirmou (criado pelo convite), o Supabase envia o
      // template de convite. Quem já tem conta ativa recebe email_exists: ele já
      // entra e vê o novo grupo; avisá-lo por e-mail fica para o SMTP próprio.
      const { error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirecionarPara,
      });
      if (!error) return { enviado: true };
      if (jaExiste(error)) return { enviado: false, motivo: 'usuario_ja_ativo' };
      throw new Error(`Envio do convite recusado: ${error.message}.`);
    },
  };

  return { identidade, envio };
}

/**
 * Remoção do segundo fator (SP1, ADR-049 e adendo ao ADR-024): o reset para
 * quem perdeu o aparelho. Só lista e remove os fatores do usuário pedido, pela
 * API de administração do MFA; não lê nem muda mais nada da conta. Quem pede e
 * o alvo são conferidos antes, pela aplicação.
 */
export function criarAdministracaoDoSegundoFator(opcoes: {
  url: string;
}): AdministracaoDoSegundoFator {
  const admin = clienteAdmin(opcoes.url);
  return {
    async removerFatores(usuarioId) {
      const lista = await admin.auth.admin.mfa.listFactors({ userId: usuarioId });
      if (lista.error) {
        throw new Error(`Segundo fator: não listou os fatores (${lista.error.message}).`);
      }
      let removidos = 0;
      for (const fator of lista.data.factors) {
        const r = await admin.auth.admin.mfa.deleteFactor({ userId: usuarioId, id: fator.id });
        if (r.error) throw new Error(`Segundo fator: não removeu o fator (${r.error.message}).`);
        removidos++;
      }
      return removidos;
    },
  };
}

/**
 * Identidade para os dados de demonstração do kit de teste (docs/05, "Kit de
 * teste"), só no dev e na CI: a conta nasce com o e-mail já confirmado e a
 * senha de teste, sem convite nem e-mail, para cada papel entrar direto pela
 * tela de login. Quem já existe fica com a senha de teste de novo, para o
 * script poder rodar mais de uma vez. O resto do convite (membro, atribuição,
 * auditoria e evento) é o caso de uso de sempre.
 */
export function criarIdentidadeDeDemonstracao(opcoes: {
  url: string;
  senha: string;
}): ProvedorDeIdentidade {
  // Adendo ao ADR-024 (M1 do docs/11): na Vercel, preview ou produção, nunca.
  // Repete a trava de apps/web/src/servidor/demonstracao.ts no dono da chave.
  if (process.env.VERCEL_ENV) {
    throw new Error('A identidade de demonstração não roda na Vercel.');
  }
  const admin = clienteAdmin(opcoes.url);
  return {
    async garantirUsuario({ email, nome, tenantId, nomeTenant }) {
      // O domínio .test (RFC 2606) nunca é de uma pessoa: a senha de teste não
      // sobrescreve a de uma conta de verdade.
      if (!/@[a-z0-9.-]+\.test$/.test(email)) {
        throw new Error('Identidade de demonstração só com e-mail do domínio .test.');
      }
      const criado = await admin.auth.admin.createUser({
        email,
        password: opcoes.senha,
        email_confirm: true,
        user_metadata: { nome, tenant: nomeTenant },
        app_metadata: { hk_tenants: [tenantId] },
      });
      if (!criado.error && criado.data.user) {
        return { usuarioId: criado.data.user.id, criadoAgora: true };
      }
      if (!jaExiste(criado.error)) {
        throw new Error(
          `Identidade de demonstração recusada: ${criado.error?.message ?? 'sem usuário'}.`,
        );
      }
      // generateLink não envia e-mail; aqui só serve para obter o id de quem existe.
      const existente = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const usuarioId = existente.data.user?.id;
      if (!usuarioId) {
        throw new Error(
          `Identidade: usuário existente sem id (${existente.error?.message ?? '?'}).`,
        );
      }
      const r = await admin.auth.admin.updateUserById(usuarioId, {
        password: opcoes.senha,
        email_confirm: true,
      });
      if (r.error) throw new Error(`Senha de teste recusada: ${r.error.message}.`);
      return { usuarioId, criadoAgora: false };
    },

    async removerUsuario(usuarioId) {
      const r = await admin.auth.admin.deleteUser(usuarioId);
      if (r.error) throw new Error(`Compensação: não removeu o usuário (${r.error.message}).`);
    },

    vincularTenant: (usuarioId, tenantId) => vincularTenant(admin, usuarioId, tenantId),
  };
}

/**
 * O Storage recusa a URL (ou o envio) para caminho que já tem arquivo, com
 * "409 Duplicate" no corpo; o status HTTP varia entre versões (400 ou 409).
 */
function arquivoJaExiste(erro: {
  message?: string;
  statusCode?: unknown;
  status?: unknown;
}): boolean {
  return (
    String(erro.statusCode) === '409' ||
    erro.status === 409 ||
    /already exists|duplicate/i.test(erro.message ?? '')
  );
}

/** Bucket privado da migração 0004. */
export const BUCKET_DE_ANEXOS = 'anexos';

/**
 * URL assinada do Storage (F0-10, ADR-024). O bucket não tem policy para o
 * usuário: só a secret key emite a URL, e só depois de a aplicação conferir o
 * escopo pela RLS. Nada aqui lê ou lista objetos, nem toca tabela do HubKeep.
 */
export function criarArmazenamentoDeAnexos(opcoes: { url: string }): ArmazenamentoDeArquivos {
  const bucket = clienteAdmin(opcoes.url).storage.from(BUCKET_DE_ANEXOS);
  return {
    async urlDeUpload(caminho) {
      // upsert: false (o padrão, dito aqui de propósito): a URL não sobrescreve
      // objeto que já existe; o Storage recusa o segundo envio.
      const { data, error } = await bucket.createSignedUploadUrl(caminho, { upsert: false });
      if (error && arquivoJaExiste(error)) return null;
      if (error || !data)
        throw new Error(`URL de upload recusada pelo Storage: ${error?.message ?? '?'}.`);
      return { url: data.signedUrl, token: data.token };
    },
    async urlDeDownload(caminho, segundos) {
      const { data, error } = await bucket.createSignedUrl(caminho, segundos);
      if (error || !data)
        throw new Error(`URL de download recusada pelo Storage: ${error?.message ?? '?'}.`);
      return data.signedUrl;
    },
  };
}
