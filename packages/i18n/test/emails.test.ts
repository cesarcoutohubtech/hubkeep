// E-mail de convite da F0-09 no catálogo (aceite da F0-10b), nos quatro
// idiomas, montado no Node como o worker monta. O template do Supabase gerado
// daqui é conferido em tests/i18n-templates.test.ts.
import { describe, expect, it } from 'vitest';
import { IDIOMAS, emailDeAvisoDeSla, emailDeConvite } from '../src/index';

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

describe('e-mail do aviso de SLA (1c, ADR-046)', () => {
  const dados = {
    tipo: 'solucao_vencida',
    descricao: 'Elevador <parado>\nentre andares',
    hotel: 'Hotel Centro',
    prazo: new Date('2026-10-13T20:00:00Z'),
    fuso: 'America/Sao_Paulo',
    link: 'https://hubkeep.example/chamados/01900000-0000-7000-8000-000000000001',
  };

  it.each([
    ['pt-BR', 'Solução vencida — Hotel Centro', 'Abrir o chamado'],
    ['en', 'Resolution overdue — Hotel Centro', 'Open the ticket'],
    ['es', 'Solución vencida — Hotel Centro', 'Abrir la solicitud'],
    ['fr', 'Résolution en retard — Hotel Centro', 'Ouvrir la demande'],
  ] as const)('%s: assunto, ação e link', (idioma, assunto, acao) => {
    const e = emailDeAvisoDeSla(idioma, dados);
    expect(e.assunto).toBe(assunto);
    expect(e.html).toContain(acao);
    expect(e.html).toContain(`href="${dados.link}"`);
    expect(e.texto).toContain(`${acao}: ${dados.link}`);
  });

  it('o prazo sai no fuso do hotel', () => {
    // 20h UTC são 17h em São Paulo.
    expect(emailDeAvisoDeSla('pt-BR', dados).texto).toContain('17:00');
    expect(emailDeAvisoDeSla('pt-BR', { ...dados, fuso: 'UTC' }).texto).toContain('20:00');
  });

  it('o que vem do cadastro é escapado no HTML, e o assunto não quebra linha', () => {
    const e = emailDeAvisoDeSla('pt-BR', { ...dados, hotel: 'Hotel\r\nBcc: x@y' });
    expect(e.html).toContain('Elevador &lt;parado&gt;');
    expect(e.html).not.toContain('<parado>');
    expect(e.assunto).not.toMatch(/[\r\n]/);
  });

  it('cada tipo do monitor tem o título dele', () => {
    const titulos = [
      'atendimento_em_risco',
      'atendimento_vencido',
      'solucao_em_risco',
      'solucao_vencida',
    ].map((tipo) => emailDeAvisoDeSla('pt-BR', { ...dados, tipo }).texto.split('\n')[0]);
    expect(titulos).toEqual([
      'Atendimento perto de vencer',
      'Atendimento vencido',
      'Solução perto de vencer',
      'Solução vencida',
    ]);
  });
});
