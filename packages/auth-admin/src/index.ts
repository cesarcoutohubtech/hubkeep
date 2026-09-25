// @hubkeep/auth-admin — o ÚNICO pacote que usa a secret key do Supabase
// (CLAUDE.md, regra 5). Ela serve só para administrar o Auth (convites) e
// nunca para ler ou gravar dados de negócio. A chave é lida aqui dentro, da
// variável SUPABASE_SECRET_KEY: quem compõe o app não a manipula, e a CI
// (tests/secret-key-so-no-auth-admin.test.ts) falha se ela aparecer fora daqui.
//
// Importável só por apps/web/src/servidor (lint), para nunca entrar num bundle
// de navegador.
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { EnvioDeConvite, ProvedorDeIdentidade } from '@hubkeep/aplicacao';

function clienteAdmin(url: string): SupabaseClient {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error('SUPABASE_SECRET_KEY não está definida (só o servidor a recebe).');
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const jaExiste = (e: { code?: string | undefined; status?: number | undefined } | null) =>
  e?.code === 'email_exists' || e?.status === 422;

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
      const criado = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        // O template do convite usa {{ .Data.nome }} e {{ .Data.tenant }}.
        user_metadata: { nome, tenant: nomeTenant },
        app_metadata: { hk_tenants: [tenantId] },
      });
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
        `Identidade recusada pelo provedor: ${criado.error?.message ?? 'sem usuário'}.`,
      );
    },

    async removerUsuario(usuarioId) {
      const r = await admin.auth.admin.deleteUser(usuarioId);
      if (r.error) throw new Error(`Compensação: não removeu o usuário (${r.error.message}).`);
    },

    // app_metadata só é gravável com a secret key e viaja assinado no JWT.
    async vincularTenant(usuarioId, tenantId) {
      const atual = await admin.auth.admin.getUserById(usuarioId);
      if (atual.error || !atual.data.user) {
        throw new Error(
          `Vínculo de tenant: usuário não encontrado (${atual.error?.message ?? '?'}).`,
        );
      }
      const meta = atual.data.user.app_metadata ?? {};
      const lista: unknown = meta['hk_tenants'];
      const tenants = new Set(
        Array.isArray(lista) ? lista.filter((t) => typeof t === 'string') : [],
      );
      if (tenants.has(tenantId)) return;
      tenants.add(tenantId);
      const r = await admin.auth.admin.updateUserById(usuarioId, {
        app_metadata: { ...meta, hk_tenants: [...tenants] },
      });
      if (r.error) throw new Error(`Vínculo de tenant recusado: ${r.error.message}.`);
    },
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
