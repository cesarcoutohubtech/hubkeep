// Licença de UHs (docs/00): UH nova só entra ativa em hotel ativo com saldo.
import { describe, expect, it } from 'vitest';
import { contaComoUh, saldoDeUhs, statusDaUhNova } from '../src/licenca';

describe('licença de UHs', () => {
  it('conta só UH ativa; área comum e UH pendente não contam', () => {
    expect(contaComoUh({ tipo: 'uh', status: 'ativo' })).toBe(true);
    expect(contaComoUh({ tipo: 'uh', status: 'pendente_licenca' })).toBe(false);
    expect(contaComoUh({ tipo: 'uh', status: 'inativo' })).toBe(false);
    expect(contaComoUh({ tipo: 'area_comum', status: 'ativo' })).toBe(false);
  });

  it('saldo nunca é negativo', () => {
    expect(saldoDeUhs({ contratadas: 10, emUso: 3 })).toBe(7);
    expect(saldoDeUhs({ contratadas: 2, emUso: 5 })).toBe(0);
    expect(saldoDeUhs({ contratadas: 0, emUso: 0 })).toBe(0);
  });

  it('UH nova: ativa só em hotel ativo com saldo; senão pendente_licenca', () => {
    expect(statusDaUhNova('ativo', 1)).toBe('ativo');
    expect(statusDaUhNova('ativo', 0)).toBe('pendente_licenca');
    expect(statusDaUhNova('em_implantacao', 10)).toBe('pendente_licenca');
    expect(statusDaUhNova('desativado', 10)).toBe('pendente_licenca');
  });
});
