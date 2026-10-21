// MFA obrigatório (SP1, ADR-049): a tabela papel × nível da sessão, escrita à mão.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type NivelDaSessao,
  PAPEIS,
  type Papel,
  exigeSegundoFator,
  exigirNivelDaSessao,
} from '../src';

const agora = new Date('2026-10-21T12:00:00Z');
const atr = (papel: Papel, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u-1',
  papel,
  escopo: { tipo: 'grupo' },
  validoAte: null,
  revogadoEm: null,
  ...extra,
});
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? 'sem_codigo';
  }
};

const EXIGE: Record<Papel, boolean> = {
  admin_grupo: true,
  gestor_csc: true,
  implantador: true,
  gerente_hotel: false,
  tecnico: false,
  solicitante: false,
  proprietario: false,
};

describe('papel × nível da sessão', () => {
  for (const papel of PAPEIS)
    for (const nivel of ['aal1', 'aal2'] as NivelDaSessao[]) {
      const esperado = EXIGE[papel] && nivel === 'aal1' ? 'segundo_fator_obrigatorio' : null;
      it(`${papel} em ${nivel}: ${esperado ?? 'passa'}`, () => {
        expect(codigo(() => exigirNivelDaSessao(nivel, [atr(papel)], agora))).toBe(esperado);
      });
    }
});

describe('regras além da tabela', () => {
  it('dois papéis, um da lista, exigem', () => {
    expect(exigeSegundoFator([atr('tecnico'), atr('implantador')], agora)).toBe(true);
  });

  it('o papel vencido ou revogado não exige', () => {
    const vencido = atr('implantador', { validoAte: new Date('2026-10-20T00:00:00Z') });
    const revogado = atr('admin_grupo', { revogadoEm: new Date('2026-10-01T00:00:00Z') });
    expect(exigeSegundoFator([vencido, revogado, atr('tecnico')], agora)).toBe(false);
    expect(codigo(() => exigirNivelDaSessao('aal1', [vencido, revogado], agora))).toBeNull();
  });

  it('sem atribuição, não exige', () => {
    expect(exigeSegundoFator([], agora)).toBe(false);
  });
});
