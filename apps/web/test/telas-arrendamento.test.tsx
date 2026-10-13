// Tela da matriz do arrendado (fase 1c; decisões 5 a 7): o bloco nos quatro
// idiomas e no pseudo-idioma, renderizado no servidor (react-dom/server), com
// dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlocoDaMatriz } from '../src/cliente/blocos-do-arrendamento';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const AR = '01900000-0000-7000-8000-0000000000a1';
const ELETRICA = '01900000-0000-7000-8000-0000000000a2';
const pt = mensagensDe('pt-BR');

const PROPS: ComponentProps<typeof BlocoDaMatriz> = {
  politica: {
    chave: 'hotel.matriz_arrendamento',
    padrao: {},
    grupo: { [AR]: 'locador' },
    bandeira: null,
    hotel: null,
    efetiva: { [AR]: 'locador' },
    origem: 'grupo',
  },
  categorias: [
    { id: AR, chavePadrao: null, nome: 'Ar-condicionado' },
    { id: ELETRICA, chavePadrao: null, nome: 'Elétrica' },
  ],
  hotel: { arrendado: true },
  aoGravar: () => undefined,
};

const renderizar = (idioma: IdiomaDeExibicao, props = PROPS) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <BlocoDaMatriz {...props} />
    </ProvedorDeIdioma>,
  );

describe('matriz do arrendado em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: o bloco, sem chave crua nem estilo inline',
    (idioma) => {
      const html = renderizar(idioma);
      expect(html).toContain('data-politica="hotel.matriz_arrendamento"');
      expect(html).not.toMatch(/admin\.arrendamento\./);
      expect(html).not.toContain('style=');
      expect(html).toContain('Ar-condicionado');
    },
  );

  it('pt-BR: a regra efetiva escolhida; a categoria sem regra com a arrendatária', () => {
    const html = renderizar('pt-BR');
    expect(html).toMatch(
      new RegExp(`name="categoria\\.${AR}"[^]*?<option value="locador" selected="">`),
    );
    expect(html).toMatch(
      new RegExp(`name="categoria\\.${ELETRICA}"[^]*?<option value="arrendataria" selected="">`),
    );
    expect(html).toContain('Ar-condicionado: Quem responde');
  });

  it('os botões: o grupo sempre, o hotel com hotel; nunca a bandeira', () => {
    const contar = (html: string, valor: string) =>
      html.match(new RegExp(`<button[^>]*value="${valor}"[^>]*type="submit"`, 'g'))?.length ?? 0;
    const comHotel = renderizar('pt-BR');
    expect(contar(comHotel, 'grupo')).toBe(1);
    expect(contar(comHotel, 'hotel')).toBe(1);
    expect(contar(comHotel, 'bandeira')).toBe(0);
    expect(comHotel).toContain(pt['admin.configuracao.acao.herdar_grupo']);
    expect(contar(renderizar('pt-BR', { ...PROPS, hotel: null }), 'hotel')).toBe(0);
  });

  it('o hotel que não é arrendado avisa; sem categoria, a mensagem no lugar da tabela', () => {
    expect(renderizar('pt-BR')).not.toContain(pt['admin.arrendamento.hotel_nao_arrendado']);
    expect(renderizar('pt-BR', { ...PROPS, hotel: { arrendado: false } })).toContain(
      pt['admin.arrendamento.hotel_nao_arrendado'],
    );
    const vazio = renderizar('pt-BR', { ...PROPS, categorias: [] });
    expect(vazio).toContain(pt['admin.arrendamento.vazio']);
    expect(vazio).not.toContain('data-categoria=');
  });
});
