// Históricos sintéticos para os testes do motor.
import type { Corretiva } from '../src';

export const agora = new Date('2026-09-30T12:00:00Z');
export const dia = (d: number, base = agora) => new Date(base.getTime() + d * 86_400_000);
export const hora = (h: number, base = agora) => new Date(base.getTime() + h * 3_600_000);

let seq = 0;
export function corretiva(p: Partial<Corretiva> & { abertaEm: Date }): Corretiva {
  seq += 1;
  return {
    id: `c${seq}`,
    hotelId: 'h1',
    localId: 'l1',
    ativoId: 'a1',
    concluidaEm: null,
    reaberturas: 0,
    codigoFalha: null,
    ...p,
  };
}
