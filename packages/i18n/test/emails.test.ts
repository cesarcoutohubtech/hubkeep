// E-mail de convite da F0-09 no catálogo (aceite da F0-10b), nos quatro
// idiomas, montado no Node como o worker monta. O template do Supabase gerado
// daqui é conferido em tests/i18n-templates.test.ts.
import { describe, expect, it } from 'vitest';
import { IDIOMAS, emailDeConvite } from '../src/index';

describe('e-mail de convite', () => {
  it.each([
    ['pt-BR', 'Convite para o HubKeep', 'Aceitar o convite'],
    ['en', 'Invitation to HubKeep', 'Accept the invitation'],
    ['es', 'Invitación a HubKeep', 'Aceptar la invitación'],
    ['fr', 'Invitation à HubKeep', 'Accepter l’invitation'],
  ] as const)('%s', (idioma, assunto, acao) => {
    const email = emailDeConvite(idioma, {
      nome: 'Ana',
      tenant: 'Grupo Teste',
      link: 'https://app.hubkeep.test/auth/confirmar?token_hash=abc&type=invite',
    });
    expect(email.assunto).toBe(assunto);
    expect(email.html).toContain(`>${acao}</a>`);
    expect(email.html).toContain('<strong>Grupo Teste</strong>');
    expect(email.html).toContain('token_hash=abc&amp;type=invite');
  });

  it('nome e grupo vêm de quem cadastrou: são escapados', () => {
    const email = emailDeConvite('pt-BR', {
      nome: '<script>alert(1)</script>',
      tenant: 'A & B <img src=x>',
      link: 'https://x.test/?a="b"',
    });
    expect(email.html).not.toMatch(/<script|<img/);
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('<strong>A &amp; B &lt;img src=x&gt;</strong>');
    expect(email.html).toContain('href="https://x.test/?a=&quot;b&quot;"');
  });

  it.each(IDIOMAS)('%s: a única tag do catálogo que vira HTML é <strong>', (idioma) => {
    const { html } = emailDeConvite(idioma, { nome: 'N', tenant: 'T', link: 'https://x.test' });
    const tags = [...html.matchAll(/<\/?([a-z0-9]+)/g)].map((m) => m[1]);
    expect(new Set(tags)).toEqual(new Set(['h2', 'p', 'strong', 'a']));
  });
});
