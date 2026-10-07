// Moldura das telas autenticadas (U3): todo item do menu leva a uma tela que
// existe, e o item marcado é o da tela atual (ou o pai, no detalhe).
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({}));
vi.mock('../src/cliente/sessao', () => ({ sair: vi.fn() }));

const { MENU, itemAtivo } = await import('../src/cliente/moldura');

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
