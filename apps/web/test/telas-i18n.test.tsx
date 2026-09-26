// Aceite da F0-10b: as telas da F0-05 nos quatro idiomas e no pseudo-idioma,
// pelo mesmo catálogo e pelo mesmo provedor que o layout usa (react-intl).
// Renderiza no servidor (react-dom/server), sem navegador; a navegação do Next
// e o cliente do Supabase são trocados por dublês.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('erro=link_invalido'),
}));
vi.mock('../src/cliente/supabase', () => ({ supabaseNavegador: () => ({}) }));

const { ProvedorDeIdioma } = await import('../src/i18n/cliente');
const { default: Login } = await import('../src/app/login/page');
const { default: DefinirSenha } = await import('../src/app/definir-senha/page');
const { default: Inicio } = await import('../src/app/page');

const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('telas da F0-05 em cada idioma', () => {
  it.each([
    ['pt-BR', 'Entrar no HubKeep', 'O link de convite é inválido ou expirou.', 'Defina sua senha'],
    [
      'en',
      'Sign in to HubKeep',
      'The invitation link is invalid or has expired.',
      'Set your password',
    ],
    [
      'es',
      'Ingresar a HubKeep',
      'El enlace de invitación no es válido o expiró.',
      'Define tu contraseña',
    ],
    [
      'fr',
      'Se connecter à HubKeep',
      'Le lien d’invitation est invalide ou a expiré.',
      'Définissez votre mot de passe',
    ],
  ] as const)('%s', (idioma, titulo, erroDoLink, tituloSenha) => {
    const login = renderizar(idioma, <Login />);
    expect(login).toContain(titulo);
    expect(login).toContain(erroDoLink);
    expect(renderizar(idioma, <DefinirSenha />)).toContain(tituloSenha);
    expect(renderizar(idioma, <Inicio />)).toContain(mensagensDe(idioma)['comum.carregando']);
  });

  it('todos os idiomas aparecem no seletor, cada um no próprio nome', () => {
    const login = renderizar('pt-BR', <Login />);
    for (const i of IDIOMAS) expect(login).toContain(`value="${i}"`);
    expect(login).toMatch(/>English</);
    expect(login).toMatch(/>français</i);
  });

  it('pseudo-idioma: todo texto visível da tela vem do catálogo (entre colchetes)', () => {
    const html = renderizar(PSEUDO_IDIOMA, <Login />);
    // Texto entre tags, sem o seletor (nomes de idioma vêm do Intl, não do catálogo).
    const textos = [...html.replace(/<select[\s\S]*?<\/select>/g, '').matchAll(/>([^<>]+)</g)]
      .map((m) => (m[1] ?? '').trim())
      .filter(Boolean);
    expect(textos.length).toBeGreaterThan(4);
    for (const texto of textos) expect(texto, texto).toMatch(/^\[.*\]$/s);
    // Placeholders também.
    for (const m of html.matchAll(/placeholder="([^"]*)"/g)) expect(m[1]).toMatch(/^\[.*\]$/);
  });
});
