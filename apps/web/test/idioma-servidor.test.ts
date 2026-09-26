// Ajustes do ADR-022 aprovados pelo Cesar (26/09/2026):
//   (c) o cookie hk_idioma só vale sem perfil: com sessão, decide o perfil;
//   (d) o pseudo-idioma nunca aparece em produção, mesmo com a variável ligada.
import { describe, expect, it } from 'vitest';
import { escolherIdioma, pseudoIdiomaLiberado } from '../src/i18n/servidor';

const base = { cookie: undefined, acceptLanguage: null, pseudoLiberado: false } as const;

describe('(c) cookie hk_idioma só vale sem perfil', () => {
  it('com sessão, o idioma do perfil passa por cima do cookie e do navegador', () => {
    expect(escolherIdioma({ ...base, perfil: 'es', cookie: 'fr', acceptLanguage: 'en' })).toBe(
      'es',
    );
  });

  it('sem sessão, vale o cookie (escolha no seletor do login)', () => {
    expect(escolherIdioma({ ...base, perfil: null, cookie: 'fr', acceptLanguage: 'en' })).toBe(
      'fr',
    );
  });

  it('sem sessão e sem cookie válido: Accept-Language, depois pt-BR', () => {
    expect(escolherIdioma({ ...base, perfil: null, cookie: 'xx', acceptLanguage: 'en-GB' })).toBe(
      'en',
    );
    expect(escolherIdioma({ ...base, perfil: null })).toBe('pt-BR');
  });

  it('cookie do pseudo-idioma sem liberação é ignorado', () => {
    expect(escolherIdioma({ ...base, perfil: 'es', cookie: 'en-XA' })).toBe('es');
    expect(escolherIdioma({ ...base, perfil: null, cookie: 'en-XA' })).toBe('pt-BR');
  });

  it('pseudo-idioma liberado (dev) vale por cima do perfil: é ferramenta de teste de tela', () => {
    expect(escolherIdioma({ ...base, perfil: 'es', cookie: 'en-XA', pseudoLiberado: true })).toBe(
      'en-XA',
    );
  });
});

describe('(d) pseudo-idioma fora de produção', () => {
  it.each([
    [{ HK_PSEUDO_IDIOMA: '1' }, true],
    [{ HK_PSEUDO_IDIOMA: '1', VERCEL_ENV: 'preview' }, true],
    [{ HK_PSEUDO_IDIOMA: '1', VERCEL_ENV: 'production' }, false],
    [{ HK_PSEUDO_IDIOMA: '' }, false],
    [{}, false],
  ] as const)('%o → %s', (env, esperado) => {
    expect(pseudoIdiomaLiberado(env)).toBe(esperado);
  });
});
