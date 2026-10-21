// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade), nos
// quatro idiomas e no pseudo-idioma, renderizado no servidor
// (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CartaoDasUhs } from '../src/cliente/uhs-acompanhadas';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const HOTEIS = [
  { hotelId: '0193a000-0000-4000-8000-000000000001', hotelNome: 'Hotel Centro', uhs: 2 },
  { hotelId: '0193a000-0000-4000-8000-000000000002', hotelNome: 'Hotel Praia', uhs: 1500 },
];

const renderizar = (idioma: IdiomaDeExibicao, hoteis = HOTEIS) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <CartaoDasUhs hoteis={hoteis} />
    </ProvedorDeIdioma>,
  );

describe('UHs acompanhadas em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: sem chave crua nem estilo inline',
    (idioma) => {
      const html = renderizar(idioma);
      expect(html).not.toMatch(/inicio\.[a-z_.]+/);
      expect(html).not.toContain('style=');
    },
  );
});

describe('UHs acompanhadas', () => {
  it('um número por hotel, com o nome do hotel e o aviso de que só vê as suas unidades', () => {
    const html = renderizar('pt-BR');
    expect(html).toContain('UHs acompanhadas');
    expect(html).toContain('Você vê só os chamados das suas unidades.');
    expect(html).toContain('Hotel Centro');
    expect(html).toContain('1.500');
  });

  it('sem hotel ligado por UHs, o cartão não aparece', () => {
    expect(renderizar('pt-BR', [])).toBe('');
  });
});
