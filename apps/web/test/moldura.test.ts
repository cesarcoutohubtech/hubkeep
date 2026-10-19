// Moldura das telas autenticadas (U3): todo item do menu leva a uma tela que
// existe, e o item marcado é o da tela atual (ou o pai, no detalhe).
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({}));
vi.mock('../src/cliente/sessao', () => ({ sair: vi.fn() }));

const {
  HREF_DA_ABERTURA,
  ITEM_DO_INTELLIGENCE,
  ITEM_DA_MEWS,
  MENU,
  intelligenceAtivo,
  itemAtivo,
  tituloDaRota,
} = await import('../src/cliente/moldura');

describe('menu da moldura', () => {
  const itens = MENU.flatMap((g) => g.itens);

  it.each(itens.map((i) => i.href))('%s tem tela em app/(painel)', (href) => {
    const pasta = href === '/' ? '' : href;
    expect(existsSync(`src/app/(painel)${pasta}/page.tsx`)).toBe(true);
  });

  it('nenhum item repetido', () => {
    expect(new Set(itens.map((i) => i.href)).size).toBe(itens.length);
  });

  it('o item ativo é a tela atual ou o pai dela', () => {
    expect(itemAtivo('/', '/')).toBe(true);
    expect(itemAtivo('/chamados', '/')).toBe(false);
    expect(itemAtivo('/chamados/0190', '/chamados')).toBe(true);
    expect(itemAtivo('/os', '/chamados')).toBe(false);
    expect(itemAtivo('/admin/hoteis-x', '/admin/hoteis')).toBe(false);
  });
});

describe('título da barra pela rota', () => {
  it('as telas da operação têm título; o detalhe usa o do chamado', () => {
    expect(tituloDaRota('/')).toBe('menu.inicio');
    expect(tituloDaRota('/chamados')).toBe('corretiva.chamados.titulo');
    expect(tituloDaRota('/chamados/0190a')).toBe('corretiva.chamado.titulo');
    expect(tituloDaRota('/chamados/0190a/x')).toBeUndefined();
    expect(tituloDaRota('/os')).toBe('corretiva.os.titulo');
  });

  it.each(MENU.flatMap((g) => g.itens))('$href tem título na barra', ({ href }) => {
    expect(tituloDaRota(href)).toBeDefined();
  });

  it('o título do cadastro vem da própria tela', () => {
    expect(tituloDaRota('/admin/ativos')).toBe('admin.ativos.titulo');
    expect(tituloDaRota('/admin/ativos/x')).toBeUndefined();
  });
});

describe('o item do HubKeep Intelligence', () => {
  it('tem página e título, fora do MENU (só aparece com o módulo e o papel)', () => {
    expect(existsSync(`src/app/(painel)${ITEM_DO_INTELLIGENCE.href}/page.tsx`)).toBe(true);
    expect(MENU.flatMap((g) => g.itens).map((i) => i.href)).not.toContain(
      ITEM_DO_INTELLIGENCE.href,
    );
    expect(tituloDaRota('/inteligencia/insights')).toBe('menu.inteligencia');
    expect(tituloDaRota('/inteligencia/insights/0190a')).toBe('inteligencia.pagina.titulo');
    expect(tituloDaRota('/inteligencia/ativos/0190a')).toBe('inteligencia.ativo.titulo');
  });

  it('antes da abertura, o Admin do grupo vai à página da abertura', () => {
    expect(existsSync(`src/app/(painel)${HREF_DA_ABERTURA}/page.tsx`)).toBe(true);
    expect(tituloDaRota(HREF_DA_ABERTURA)).toBe('inteligencia.abertura.titulo');
    expect(intelligenceAtivo(HREF_DA_ABERTURA)).toBe(true);
  });

  it('fica ativo em todas as telas do módulo', () => {
    expect(intelligenceAtivo('/inteligencia/insights')).toBe(true);
    expect(intelligenceAtivo('/inteligencia/ativos/0190a')).toBe(true);
    expect(intelligenceAtivo('/inteligencia-x')).toBe(false);
    expect(intelligenceAtivo('/admin/ativos')).toBe(false);
  });
});

describe('Mews V1: menu autorizado pelo servidor', () => {
  it('não aparece no MENU geral e possui rota e título próprios', () => {
    expect(ITEM_DA_MEWS.href).toBe('/admin/mews');
    expect(MENU.flatMap((g) => g.itens).map((i) => i.href)).not.toContain(ITEM_DA_MEWS.href);
    expect(existsSync(`src/app/(painel)${ITEM_DA_MEWS.href}/page.tsx`)).toBe(true);
    expect(tituloDaRota(ITEM_DA_MEWS.href)).toBe('admin.mews.titulo');
  });
});
