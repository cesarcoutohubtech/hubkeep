import { RegraViolada } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { termoDeBusca } from '../src/busca';

describe('busca (B6)', () => {
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
