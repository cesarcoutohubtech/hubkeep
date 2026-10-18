// Telas de cadastro e configuração no pacote de interface (ADR-038, U4b):
// renderizam no servidor (estado inicial, antes da API), sem estilo inline nem
// h1 próprio (o título é o da barra da moldura), e as peças comuns ligam o
// rótulo ao controle.
import { mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const { ProvedorDeIdioma } = await import('../src/i18n/cliente');
const { Aviso } = await import('../src/cliente/aviso');
const { SeletorDeHotel } = await import('../src/cliente/cadastro');

const TELAS = [
  'arrendamento',
  'ativos',
  'bandeiras',
  'categorias',
  'configuracao',
  'equipes',
  'feriados',
  'hoteis',
  'implantacao',
  'locais',
  'mews',
  'membros',
  'proprietarios',
  'sla',
] as const;

const pt = mensagensDe('pt-BR');
const renderizar = (tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma="pt-BR" mensagens={pt} pseudoLiberado={false}>
      {tela}
    </ProvedorDeIdioma>,
  );

describe('telas de cadastro', () => {
  it.each(TELAS)('%s: sem estilo inline nem h1 próprio', async (tela) => {
    const { default: Tela } = (await import(`../src/app/(painel)/admin/${tela}/page.tsx`)) as {
      default: () => ReactNode;
    };
    const html = renderizar(<Tela />);
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<h1');
    expect(html).toContain(pt['comum.carregando']);
  });

  it.each(['ativos', 'equipes', 'feriados', 'implantacao', 'locais'] as const)(
    '%s: a escolha do hotel tem rótulo visível',
    async (tela) => {
      const { default: Tela } = (await import(`../src/app/(painel)/admin/${tela}/page.tsx`)) as {
        default: () => ReactNode;
      };
      expect(renderizar(<Tela />)).toContain(pt[`admin.${tela}.escolher_hotel`]);
    },
  );
});

describe('peças comuns dos cadastros', () => {
  it('o seletor de hotel liga o rótulo à lista e marca o escolhido', () => {
    const html = renderizar(
      <SeletorDeHotel
        rotulo="Hotel"
        hoteis={[
          { id: 'h1', nome: 'Curitiba' },
          { id: 'h2', nome: 'Rio' },
        ]}
        valor="h2"
        aoEscolher={() => {}}
      />,
    );
    const id = /<label for="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<select id="${id}"`);
    expect(html).toMatch(/<option value="h2" selected="">Rio<\/option>/);
  });

  it('o aviso mostra o texto da ação, ou "feito" sem texto', () => {
    expect(renderizar(<Aviso aviso={{ tipo: 'ok', texto: 'Convite enviado.' }} />)).toContain(
      'Convite enviado.',
    );
    const feito = renderizar(<Aviso aviso={{ tipo: 'ok' }} />);
    expect(feito).toContain(pt['comum.feito']);
    expect(feito).toContain('role="status"');
    expect(renderizar(<Aviso aviso={null} />)).toBe('');
  });
});
