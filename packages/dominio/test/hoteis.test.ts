import { describe, expect, it } from 'vitest';
import { MODELOS_CONTRATUAIS, ehModeloContratual, validarModeloContratual } from '../src/hoteis';

describe('modelo contratual do hotel (I2)', () => {
  it('os quatro valores canônicos, na ordem do desenho', () => {
    expect([...MODELOS_CONTRATUAIS]).toEqual(['proprio', 'administrado', 'arrendado', 'afiliado']);
  });

  it('nulo é "não informado" e vale; os quatro valem', () => {
    expect(validarModeloContratual(null)).toBeNull();
    for (const m of MODELOS_CONTRATUAIS) expect(validarModeloContratual(m)).toBe(m);
  });

  it('fora da lista, outra caixa ou outro tipo: hotel_modelo_contratual_invalido', () => {
    for (const v of ['franquia', 'Proprio', '', ' proprio', 1, undefined, {}]) {
      expect(ehModeloContratual(v)).toBe(false);
      expect(() => validarModeloContratual(v)).toThrow(
        expect.objectContaining({ codigo: 'hotel_modelo_contratual_invalido' }),
      );
    }
  });
});
