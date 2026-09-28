import { describe, expect, it } from 'vitest';
import { resolverNome } from '../src/nomes';

describe('nome de exibição (ADR-027)', () => {
  const nomes = { 'pt-BR': 'Refrigeração do grupo', es: 'Refrigeración' };

  it('1. o nome do tenant no idioma de quem vê', () => {
    expect(resolverNome(nomes, 'es', { doCatalogo: 'Refrigeration', idiomaPadrao: 'pt-BR' })).toBe(
      'Refrigeración',
    );
  });

  it('2. sem nome no idioma, o do catálogo', () => {
    expect(resolverNome(nomes, 'en', { doCatalogo: 'Refrigeration', idiomaPadrao: 'pt-BR' })).toBe(
      'Refrigeration',
    );
  });

  it('3. sem catálogo, o do idioma padrão do tenant; 4. depois, qualquer um', () => {
    expect(resolverNome(nomes, 'fr', { idiomaPadrao: 'pt-BR' })).toBe('Refrigeração do grupo');
    expect(resolverNome({ es: 'Saunas' }, 'fr', { idiomaPadrao: 'pt-BR' })).toBe('Saunas');
  });

  it('nome em branco não conta; sem nenhum, null', () => {
    expect(resolverNome({ en: '  ' }, 'en', { doCatalogo: null, idiomaPadrao: 'en' })).toBeNull();
    expect(resolverNome({}, 'en-XA', { doCatalogo: 'Ẽlẽvãtõrs', idiomaPadrao: 'pt-BR' })).toBe(
      'Ẽlẽvãtõrs',
    );
  });
});
