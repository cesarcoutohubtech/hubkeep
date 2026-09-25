// Regra do incidente 2 (docs/diario-fase-0.md): resposta da Management API só
// sai pela lista declarada de campos. Estes testes quebram a CI se um campo de
// segredo entrar numa lista, ou se o filtro deixar passar o que não está nela.
import { describe, expect, it } from 'vitest';
import { ENDPOINTS, type NomeDoEndpoint, filtrar } from '../scripts/ops/ler-config-remota.ts';

const NOME_DE_SEGREDO = /secret|smtp_pass|smtp_user|auth_token|api_key|access_key|private|jwk/i;
const SEGREDO = 'VALOR-QUE-NUNCA-PODE-SAIR';

describe('ler-config-remota: allowlist por endpoint', () => {
  it('nenhuma lista tem campo com nome de segredo', () => {
    for (const [nome, ep] of Object.entries(ENDPOINTS)) {
      for (const campo of ep.campos) expect(campo, `${nome}.${campo}`).not.toMatch(NOME_DE_SEGREDO);
    }
  });

  it('postgrest: o jwt_secret é descartado', () => {
    const saida = filtrar('postgrest', { db_schema: '', max_rows: 1000, jwt_secret: SEGREDO });
    expect(saida).toEqual({ db_schema: '', max_rows: 1000 });
    expect(JSON.stringify(saida)).not.toContain(SEGREDO);
  });

  it('auth: senha SMTP e segredos de hooks, SMS e provedores são descartados', () => {
    const saida = filtrar('auth', {
      site_url: 'http://localhost:3000',
      smtp_pass: SEGREDO,
      hook_send_email_secrets: SEGREDO,
      sms_twilio_auth_token: SEGREDO,
      external_google_secret: SEGREDO,
      mailer_templates_invite_content: '<p>convite</p>',
    });
    expect(JSON.stringify(saida)).not.toContain(SEGREDO);
    expect(saida).toMatchObject({ site_url: 'http://localhost:3000' });
    // O template sai só como hash.
    expect(JSON.stringify(saida)).not.toContain('<p>convite</p>');
  });

  it('chaves de assinatura: sai só a identificação, nunca a chave', () => {
    const item = { id: 'k1', algorithm: 'ES256', status: 'in_use', public_jwk: { x: SEGREDO } };
    for (const resposta of [[item], { keys: [item] }]) {
      expect(filtrar('chaves', resposta)).toEqual([
        { id: 'k1', algorithm: 'ES256', status: 'in_use' },
      ]);
    }
  });

  it('todo campo fora da lista é descartado, em qualquer endpoint', () => {
    for (const nome of Object.keys(ENDPOINTS) as NomeDoEndpoint[]) {
      const resposta = { campo_novo_do_supabase: SEGREDO };
      const entrada = ENDPOINTS[nome].lista ? [resposta] : resposta;
      expect(JSON.stringify(filtrar(nome, entrada)), nome).not.toContain(SEGREDO);
    }
  });
});
