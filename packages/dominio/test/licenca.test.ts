// Licença de UHs (docs/00): UH nova só entra ativa em hotel ativo com saldo.
import { describe, expect, it } from 'vitest';
import {
  contaComoHotel,
  contaComoUh,
  decidirAtivacao,
  saldoDeHoteis,
  saldoDeUhs,
  statusDaUhNova,
} from '../src/licenca';

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

describe('licença de hotéis e ativação (fase 1a, A1)', () => {
  const uhs = { contratadas: 10, emUso: 7 };

  it('conta só hotel ativo; saldo nunca negativo', () => {
    expect(contaComoHotel({ status: 'ativo' })).toBe(true);
    expect(contaComoHotel({ status: 'em_implantacao' })).toBe(false);
    expect(contaComoHotel({ status: 'desativado' })).toBe(false);
    expect(saldoDeHoteis({ contratados: 3, emUso: 1 })).toBe(2);
    expect(saldoDeHoteis({ contratados: 1, emUso: 4 })).toBe(0);
  });

  it('com saldo: ativa e libera as UHs pendentes até o saldo de UHs', () => {
    const hoteis = { contratados: 2, emUso: 1 };
    expect(decidirAtivacao({ status: 'em_implantacao', hoteis, uhs, uhsPendentes: 5 })).toEqual({
      ativar: true,
      uhsALiberar: 3,
    });
    expect(decidirAtivacao({ status: 'desativado', hoteis, uhs, uhsPendentes: 2 })).toEqual({
      ativar: true,
      uhsALiberar: 2,
    });
    const semSaldoDeUh = { contratadas: 1, emUso: 1 };
    expect(
      decidirAtivacao({ status: 'em_implantacao', hoteis, uhs: semSaldoDeUh, uhsPendentes: 4 }),
    ).toEqual({ ativar: true, uhsALiberar: 0 });
  });

  it('sem saldo de hotéis: bloqueia; hotel já ativo: conflito', () => {
    const cheio = { contratados: 1, emUso: 1 };
    expect(
      decidirAtivacao({ status: 'em_implantacao', hoteis: cheio, uhs, uhsPendentes: 0 }),
    ).toEqual({
      ativar: false,
      motivo: 'sem_saldo_de_hoteis',
    });
    const folga = { contratados: 5, emUso: 1 };
    expect(decidirAtivacao({ status: 'ativo', hoteis: folga, uhs, uhsPendentes: 0 })).toEqual({
      ativar: false,
      motivo: 'ja_ativo',
    });
  });
});
