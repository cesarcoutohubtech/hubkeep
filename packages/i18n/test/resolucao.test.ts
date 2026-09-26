import { describe, expect, it } from 'vitest';
import {
  FUSO_PADRAO,
  fusoValido,
  idiomaDoNavegador,
  resolverFormatoRegional,
  resolverFuso,
  resolverIdioma,
} from '../src/index';

describe('resolução do idioma: membro → hotel → tenant → navegador → pt-BR', () => {
  it.each([
    [{ membro: 'fr', hotel: 'es', tenant: 'en', navegador: 'pt-BR' }, 'fr'],
    [{ membro: null, hotel: 'es', tenant: 'en', navegador: 'fr' }, 'es'],
    [{ membro: null, hotel: null, tenant: 'en', navegador: 'fr' }, 'en'],
    [{ navegador: 'fr-CA,fr;q=0.9,en;q=0.8' }, 'fr'],
    [{}, 'pt-BR'],
    [{ membro: 'de', tenant: 'xx' }, 'pt-BR'],
  ] as const)('%o → %s', (niveis, esperado) => {
    expect(resolverIdioma(niveis)).toBe(esperado);
  });
});

describe('idioma do navegador (Accept-Language)', () => {
  it.each([
    ['pt-PT', 'pt-BR'],
    ['en-GB,en;q=0.9', 'en'],
    ['es-MX', 'es'],
    ['de-DE,de;q=0.9,es;q=0.5', 'es'],
    ['de;q=1, fr;q=0.2, en;q=0.8', 'en'],
    ['*', null],
    ['de-DE', null],
    ['en;q=0, fr', 'fr'],
  ] as const)('%s → %s', (cabecalho, esperado) => {
    expect(idiomaDoNavegador(cabecalho)).toBe(esperado);
  });

  it('aceita navigator.languages (lista)', () => {
    expect(idiomaDoNavegador(['it-IT', 'es-AR'])).toBe('es');
  });
});

describe('formato regional e fuso', () => {
  it('formato: o do membro, senão o do idioma', () => {
    expect(resolverFormatoRegional('en-GB', 'pt-BR')).toBe('en-GB');
    expect(resolverFormatoRegional(null, 'es')).toBe('es-419');
    expect(resolverFormatoRegional('xx-YY', 'fr')).toBe('fr-FR');
  });

  it('fuso: membro → hotel → padrão', () => {
    expect(resolverFuso({ membro: 'Europe/Paris', hotel: 'America/Sao_Paulo' })).toBe(
      'Europe/Paris',
    );
    expect(resolverFuso({ membro: null, hotel: 'America/Manaus' })).toBe('America/Manaus');
    expect(resolverFuso({})).toBe(FUSO_PADRAO);
  });

  it.each([
    ['America/Sao_Paulo', true],
    ['America/Argentina/Buenos_Aires', true],
    ['UTC', true],
    ['Europe/Paris', true],
    ['America/Nao_Existe', false],
    ['-03:00', false],
    ['GMT-3', false],
    ['', false],
    [null, false],
    ['a'.repeat(80), false],
  ] as const)('fusoValido(%s) = %s', (fuso, esperado) => {
    expect(fusoValido(fuso)).toBe(esperado);
  });
});
