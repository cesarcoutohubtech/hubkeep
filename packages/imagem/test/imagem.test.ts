import { describe, expect, it } from 'vitest';
import { LADO_DA_FOTO, LADO_DA_MINIATURA, TIPOS_DE_FOTO, dimensoes } from '../src/index';

describe('dimensoes', () => {
  it('limita o lado maior, mantendo a proporção', () => {
    expect(dimensoes(4000, 3000, LADO_DA_FOTO)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoes(3000, 4000, LADO_DA_MINIATURA)).toEqual({ largura: 240, altura: 320 });
  });

  it('não amplia imagem menor que o limite', () => {
    expect(dimensoes(800, 600, LADO_DA_FOTO)).toEqual({ largura: 800, altura: 600 });
  });

  it('nunca gera lado zero', () => {
    expect(dimensoes(10000, 1, LADO_DA_MINIATURA)).toEqual({ largura: 320, altura: 1 });
  });
});

describe('TIPOS_DE_FOTO', () => {
  it('cobre as imagens aceitas no anexo e deixa o PDF de fora', () => {
    expect(TIPOS_DE_FOTO).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(TIPOS_DE_FOTO).not.toContain('application/pdf');
  });
});
