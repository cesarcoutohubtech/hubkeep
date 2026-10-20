// Bloco da tolerância da preventiva em dia (1c, decisão 11) na tela de
// configuração, nos quatro idiomas e no pseudo-idioma, renderizado no servidor
// (react-dom/server), com dados prontos, sem rede.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlocoDaTolerancia } from '../src/cliente/bloco-da-tolerancia';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const PADRAO: ComponentProps<typeof BlocoDaTolerancia> = {
  politica: {
    chave: 'preventiva.tolerancia_dias',
    padrao: { dias: 0 },
    grupo: null,
    bandeira: null,
    hotel: null,
    efetiva: { dias: 0 },
    origem: 'padrao',
  },
  temHotel: false,
  temBandeira: false,
  aoGravar: () => undefined,
};
const DO_HOTEL: ComponentProps<typeof BlocoDaTolerancia> = {
  ...PADRAO,
  politica: {
    ...PADRAO.politica,
    grupo: { dias: 2 },
    hotel: { dias: 3 },
    efetiva: { dias: 3 },
    origem: 'hotel',
  },
  temHotel: true,
  temBandeira: true,
};

const renderizar = (idioma: IdiomaDeExibicao, props = PADRAO) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <BlocoDaTolerancia {...props} />
    </ProvedorDeIdioma>,
  );
const pt = mensagensDe('pt-BR');
const contar = (html: string, valor: string) =>
  html.match(new RegExp(`<button[^>]*value="${valor}"[^>]*type="submit"`, 'g'))?.length ?? 0;

describe('tolerância da preventiva em cada idioma', () => {
  it.each<IdiomaDeExibicao>([...IDIOMAS, PSEUDO_IDIOMA])(
    '%s: o bloco, sem chave crua nem estilo inline',
    (idioma) => {
      for (const props of [PADRAO, DO_HOTEL]) {
        const html = renderizar(idioma, props);
        expect(html).toContain('data-politica="preventiva.tolerancia_dias"');
        expect(html).not.toMatch(/admin\.configuracao\./);
        expect(html).not.toContain('style=');
      }
    },
  );
});

describe('tolerância da preventiva', () => {
  it('pt-BR: sem valor gravado, o padrão 0, de 0 a 30 dias, e só o botão do grupo', () => {
    const html = renderizar('pt-BR');
    expect(html).toContain('Sem tolerância: em dia só até o dia previsto');
    expect(html).toMatch(/name="dias"[^>]*value="0"/);
    expect(html).toMatch(/min="0"[^>]*max="30"/);
    expect(contar(html, 'grupo')).toBe(1);
    expect(contar(html, 'hotel')).toBe(0);
    expect(contar(html, 'bandeira')).toBe(0);
    expect(html).not.toContain(pt['admin.configuracao.acao.herdar_grupo']);
  });

  it('pt-BR: o valor do hotel, os três níveis de gravação e voltar a herdar', () => {
    const html = renderizar('pt-BR', DO_HOTEL);
    expect(html).toContain('Em dia até 3 dias depois do previsto');
    expect(html).toMatch(/name="dias"[^>]*value="3"/);
    expect(contar(html, 'grupo')).toBe(1);
    expect(contar(html, 'hotel')).toBe(1);
    expect(contar(html, 'bandeira')).toBe(1);
    expect(html).toContain(pt['admin.configuracao.acao.herdar_grupo']);
    expect(html).toContain(pt['admin.configuracao.acao.herdar_hotel']);
    expect(html).not.toContain(pt['admin.configuracao.acao.herdar_bandeira']);
  });

  it('pt-BR: um dia, no singular', () => {
    const html = renderizar('pt-BR', {
      ...PADRAO,
      politica: { ...PADRAO.politica, grupo: { dias: 1 }, efetiva: { dias: 1 }, origem: 'grupo' },
    });
    expect(html).toContain('Em dia até 1 dia depois do previsto');
  });
});
