// Foto antes ou depois e assinatura no aceite (I8): o momento sugerido, o
// momento do anexo e as duas exigências das políticas.
import { describe, expect, it } from 'vitest';
import {
  ESTADOS_DA_OS,
  MOMENTOS_DA_FOTO,
  ehMomentoDaFoto,
  exigirAssinaturaNoAceite,
  exigirFotoDepoisNaConclusao,
  momentoSugerido,
  validarMomentoDoAnexo,
} from '../src';

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

describe('momento da foto (I8)', () => {
  it('antes ou depois', () => {
    expect([...MOMENTOS_DA_FOTO]).toEqual(['antes', 'depois']);
    expect(ehMomentoDaFoto('antes')).toBe(true);
    expect(ehMomentoDaFoto('durante')).toBe(false);
    expect(ehMomentoDaFoto(null)).toBe(false);
  });

  it('sugestão: "antes" com a OS atribuída; "depois" no resto', () => {
    expect(ESTADOS_DA_OS.map((e) => [e, momentoSugerido(e)])).toEqual(
      ESTADOS_DA_OS.map((e) => [e, e === 'atribuida' ? 'antes' : 'depois']),
    );
  });

  it('o anexo da OS leva o momento; nulo ou ausente é sem momento', () => {
    expect(validarMomentoDoAnexo('os', 'depois')).toBe('depois');
    expect(validarMomentoDoAnexo('os', null)).toBeNull();
    expect(validarMomentoDoAnexo('ativo', undefined)).toBeNull();
  });

  it('momento inválido ou fora da OS: 422', () => {
    expect(codigo(() => validarMomentoDoAnexo('os', 'durante'))).toBe('momento_da_foto_invalido');
    for (const entidade of ['hotel', 'local', 'ativo', 'chamado'])
      expect(codigo(() => validarMomentoDoAnexo(entidade, 'antes'))).toBe('momento_so_na_os');
  });
});

describe('políticas da I8', () => {
  it('foto "depois" na conclusão: cobrada só com a política ligada', () => {
    expect(() => exigirFotoDepoisNaConclusao(false, 0)).not.toThrow();
    expect(() => exigirFotoDepoisNaConclusao(true, 1)).not.toThrow();
    expect(codigo(() => exigirFotoDepoisNaConclusao(true, 0))).toBe('foto_depois_obrigatoria');
  });

  it('assinatura no aceite: cobrada só com a política ligada', () => {
    expect(() => exigirAssinaturaNoAceite(false, false)).not.toThrow();
    expect(() => exigirAssinaturaNoAceite(true, true)).not.toThrow();
    expect(codigo(() => exigirAssinaturaNoAceite(true, false))).toBe(
      'assinatura_obrigatoria_no_aceite',
    );
  });
});
