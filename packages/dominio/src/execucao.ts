// Execução da OS (fase 1a, C4). Quem registra e em que estado é regra de
// corretiva.ts (decidirRegistroNaOs); aqui ficam o apontamento de horas e o
// material em texto livre. O banco guarda só o formato (fim depois do início,
// texto de 1 a 500); o limite do apontamento é daqui.
import { RegraViolada } from './erros';

export const LIMITE_HORAS_POR_APONTAMENTO = 24;
/** Folga para o relógio do aparelho adiantado (o apontamento chega depois, na sincronização). */
export const FOLGA_DO_RELOGIO_MINUTOS = 10;
export const LIMITE_MATERIAL = 500;

/** Apontamento: fim depois do início, até 24 h, e fim até 10 min no futuro. */
export function validarApontamento(
  a: { inicio: Date; fim: Date },
  agora: Date,
): { inicio: Date; fim: Date } {
  const duracao = a.fim.getTime() - a.inicio.getTime();
  const noFuturo = a.fim.getTime() - agora.getTime();
  if (
    Number.isNaN(duracao) ||
    duracao <= 0 ||
    duracao > LIMITE_HORAS_POR_APONTAMENTO * 3_600_000 ||
    noFuturo > FOLGA_DO_RELOGIO_MINUTOS * 60_000
  ) {
    throw new RegraViolada('apontamento_invalido', 'Apontamento de horas inválido.', {
      maximoHoras: LIMITE_HORAS_POR_APONTAMENTO,
    });
  }
  return a;
}

/** Material: sem espaços nas pontas, de 1 a 500 caracteres. */
export function normalizarMaterial(descricao: string): string {
  const limpa = descricao.trim().replace(/\s+/g, ' ');
  if (limpa.length === 0 || limpa.length > LIMITE_MATERIAL) {
    throw new RegraViolada('material_invalido', 'Descreva o material.', {
      maximo: LIMITE_MATERIAL,
    });
  }
  return limpa;
}
