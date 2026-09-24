// @hubkeep/auth-admin — o ÚNICO pacote que usa a secret key do Supabase
// (CLAUDE.md, regra 5). Ela serve só para administrar o Auth (convites) e
// nunca para ler ou gravar dados de negócio. A chave é lida aqui dentro, da
// variável SUPABASE_SECRET_KEY: quem compõe o app não a manipula, e a CI
// (tests/secret-key-so-no-auth-admin.test.ts) falha se ela aparecer fora daqui.
//
// Importável só por apps/web/src/servidor (lint), para nunca entrar num bundle
// de navegador.
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { PedidoDeConvite, ProvedorDeConvite } from '@hubkeep/aplicacao';

function clienteAdmin(url: string): SupabaseClient {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error('SUPABASE_SECRET_KEY não está definida (só o servidor a recebe).');
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Adaptador de convite pelo e-mail padrão do Supabase (dev). O Supabase cria o
 * usuário e envia o próprio template, com limite baixo de envio — por isso o
 * envio está atrás da porta ProvedorDeConvite, e o SMTP próprio entra como
 * outro adaptador (link gerado aqui + EnviadorDeEmail) sem mexer no caso de uso.
 *
 * Usuário que já existe no Auth (membro de outro tenant, ou convite reenviado)
 * não recebe um segundo convite do Supabase: devolvemos o id dele e o membro é
 * gravado do mesmo jeito (ADR-014, convite idempotente). Avisar essa pessoa por
 * e-mail fica para o adaptador de SMTP próprio.
 */
export function criarProvedorConviteSupabase(opcoes: { url: string }): ProvedorDeConvite {
  const admin = clienteAdmin(opcoes.url);

  return {
    async convidar(pedido: PedidoDeConvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(pedido.email, {
        redirectTo: pedido.redirecionarPara,
        data: { nome: pedido.nomeConvidado, tenant: pedido.nomeTenant },
      });
      if (!error && data.user) return { usuarioId: data.user.id };

      if (error?.code === 'email_exists' || error?.status === 422) {
        // generateLink não envia e-mail; aqui só serve para obter o id.
        const existente = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: pedido.email,
        });
        if (existente.data.user) return { usuarioId: existente.data.user.id };
        throw new Error(`Convite: usuário existente sem id (${existente.error?.message ?? '?'}).`);
      }
      throw new Error(
        `Convite recusado pelo provedor: ${error?.message ?? 'resposta sem usuário'}.`,
      );
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
}
