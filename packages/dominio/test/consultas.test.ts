// Listas de chamados e OS e linha do tempo (C7): período e motivo da auditoria.
import { describe, expect, it } from 'vitest';
import { motivoDaAuditoria, validarPeriodoDaLista } from '../src';

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('período da lista', () => {
  const d = (iso: string) => new Date(iso);

  it('sem período, ou só com um dos lados, vale', () => {
    expect(() => validarPeriodoDaLista(null, null)).not.toThrow();
    expect(() => validarPeriodoDaLista(d('2026-09-01T00:00:00Z'), null)).not.toThrow();
    expect(() => validarPeriodoDaLista(null, d('2026-09-01T00:00:00Z'))).not.toThrow();
  });

  it('o início antes do fim vale; igual ou depois, 422 periodo_invalido', () => {
    expect(() =>
      validarPeriodoDaLista(d('2026-09-01T00:00:00Z'), d('2026-09-02T00:00:00Z')),
    ).not.toThrow();
    for (const [de, ate] of [
      ['2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z'],
      ['2026-09-03T00:00:00Z', '2026-09-02T00:00:00Z'],
    ] as const)
      expect(codigo(() => validarPeriodoDaLista(d(de), d(ate)))).toBe('periodo_invalido');
  });

  it('data inválida, 422 periodo_invalido', () => {
    expect(codigo(() => validarPeriodoDaLista(d('x'), null))).toBe('periodo_invalido');
    expect(codigo(() => validarPeriodoDaLista(null, d('x')))).toBe('periodo_invalido');
  });
});

describe('motivo na linha do tempo', () => {
  it('lê o motivo da reabertura e do cancelamento da OS e do chamado', () => {
    expect(motivoDaAuditoria({ motivo: 'Voltou a pingar', versao: 3 })).toBe('Voltou a pingar');
    expect(motivoDaAuditoria({ acao: 'cancelar', motivoCancelamento: 'Duplicado' })).toBe(
      'Duplicado',
    );
  });

  it('sem motivo, ou fora do formato, null', () => {
    for (const depois of [null, undefined, 'texto', { versao: 2 }, { motivo: '' }, { motivo: 3 }])
      expect(motivoDaAuditoria(depois)).toBeNull();
  });
});
