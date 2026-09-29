import { RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { buscaDeAtivo, buscaDeLocal, termoDeBusca } from '../src/busca';

describe('busca (B6)', () => {
  it('local: o nome, sem acento e em minúsculas', () => {
    expect(buscaDeLocal('Salão de Café')).toBe('salao de cafe');
  });

  it('ativo: nome, fabricante, modelo e série, pulando os vazios', () => {
    expect(
      buscaDeAtivo({
        nome: 'Refrigerador',
        fabricante: 'Cônsul',
        modelo: null,
        numeroSerie: 'SN-9',
      }),
    ).toBe('refrigerador consul sn-9');
  });

  it('termo: normalizado; ausente ou em branco, sem filtro', () => {
    expect(termoDeBusca('  AÇÚcar ')).toBe('acucar');
    expect(termoDeBusca(undefined)).toBeUndefined();
    expect(termoDeBusca(null)).toBeUndefined();
    expect(termoDeBusca('   ')).toBeUndefined();
  });

  it('termo com menos de 3 caracteres: busca_curta, com o mínimo', () => {
    expect(() => termoDeBusca('Aç')).toThrow(RegraViolada);
    expect(() => termoDeBusca('Aç')).toThrow(
      expect.objectContaining({ codigo: 'busca_curta', parametros: { minimo: 3 } }),
    );
  });
});
