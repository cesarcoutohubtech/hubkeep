// UH-dias perdidos por manutenção (proposta de 07/10/2026, aguardando aprovação).
import { describe, expect, it } from 'vitest';
import { type PeriodoDeUhIndisponivel, uhDiasPerdidos } from '../src';
import { agora, dia, hora } from './apoio';

const periodo = (
  p: Partial<PeriodoDeUhIndisponivel> & { inicio: Date },
): PeriodoDeUhIndisponivel => ({
  chamadoId: 'c1',
  hotelId: 'h1',
  localId: 'l1',
  ativoId: null,
  fim: null,
  ...p,
});
const de = dia(-30);

describe('uhDiasPerdidos', () => {
  it('sem período, zero; 36 horas dentro do intervalo, 1,5 UH-dia', () => {
    expect(uhDiasPerdidos([], de, agora, agora)).toBe(0);
    expect(
      uhDiasPerdidos([periodo({ inicio: dia(-10), fim: hora(-240 + 36) })], de, agora, agora),
    ).toBe(1.5);
  });

  it('UH diferentes somam; a mesma UH com períodos sobrepostos conta uma vez', () => {
    const a = periodo({ inicio: dia(-10), fim: dia(-8), localId: 'l1' });
    const b = periodo({ inicio: dia(-10), fim: dia(-9), localId: 'l2' });
    expect(uhDiasPerdidos([a, b], de, agora, agora)).toBe(3);
    const c = periodo({ inicio: dia(-9), fim: dia(-7), localId: 'l1', chamadoId: 'c2' });
    expect(uhDiasPerdidos([a, c], de, agora, agora)).toBe(3);
  });

  it('o mesmo número de local em hotéis diferentes são UH diferentes', () => {
    const a = periodo({ inicio: dia(-3), fim: dia(-2), hotelId: 'h1' });
    const b = periodo({ inicio: dia(-3), fim: dia(-2), hotelId: 'h2' });
    expect(uhDiasPerdidos([a, b], de, agora, agora)).toBe(2);
  });

  it('o período é cortado no intervalo, e o aberto conta até agora', () => {
    expect(uhDiasPerdidos([periodo({ inicio: dia(-40), fim: dia(-25) })], de, agora, agora)).toBe(
      5,
    );
    expect(uhDiasPerdidos([periodo({ inicio: dia(-2) })], de, agora, agora)).toBe(2);
    expect(uhDiasPerdidos([periodo({ inicio: dia(-2) })], de, dia(-1), agora)).toBe(1);
    expect(uhDiasPerdidos([periodo({ inicio: dia(-50), fim: dia(-45) })], de, agora, agora)).toBe(
      0,
    );
  });
});
