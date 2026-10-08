// Históricos sintéticos para os testes do motor.
import { type ConfigSistemico, type Corretiva, PADRAO_SISTEMICO } from '../src';

/** O padrão do sistêmico com as cinco regras ligadas (por padrão só o mesmo modelo vem ligado). */
export const todasAsRegras: ConfigSistemico = {
  ...PADRAO_SISTEMICO,
  mesmoAndar: { ...PADRAO_SISTEMICO.mesmoAndar, ativa: true },
  mesmaAreaComum: { ...PADRAO_SISTEMICO.mesmaAreaComum, ativa: true },
  mesmoFornecedor: { ...PADRAO_SISTEMICO.mesmoFornecedor, ativa: true },
  crescimento: { ...PADRAO_SISTEMICO.crescimento, ativa: true },
};

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
