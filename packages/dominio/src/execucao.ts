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

/**
 * Hora da transição da OS feita no aparelho (I9, decisão do Cesar de
 * 08/10/2026): a operação offline leva a hora em que o técnico agiu, e a
 * transição grava essa hora, e não a da sincronização (MTTR).
 * - Sem a hora (operação guardada antes da I9) ou com data inválida: a do servidor.
 * - No futuro (relógio do aparelho adiantado): a do servidor.
 * - Antes da transição anterior da OS (relógio atrasado): a da anterior, para
 *   as transições ficarem em ordem.
 * Nunca recusa: uma operação recusada pela hora travaria a fila do aparelho.
 */
export function horaDaTransicao(
  feitaEm: Date | null | undefined,
  anterior: Date | null,
  agora: Date,
): Date {
  let quando = feitaEm && !Number.isNaN(feitaEm.getTime()) ? feitaEm : agora;
  if (quando.getTime() > agora.getTime()) quando = agora;
  if (anterior && quando.getTime() < anterior.getTime()) quando = anterior;
  return quando;
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
