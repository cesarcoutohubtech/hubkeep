// Turma de treinamento do kit de teste (docs/13, resposta 3 do Cesar de
// 08/10/2026): um grupo de demonstração novo por turma, sem apagar nada.

export const TURMA_MAXIMA = 99;

/** Lê `--turma N` (1 a 99); sem o argumento, null (o grupo de sempre). */
export function lerTurma(argv: readonly string[]): number | null {
  const i = argv.indexOf('--turma');
  if (i < 0) return null;
  const bruto = argv[i + 1] ?? '';
  const n = /^\d{1,2}$/.test(bruto) ? Number(bruto) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > TURMA_MAXIMA) {
    throw new Error(`--turma precisa de um número de 1 a ${TURMA_MAXIMA}.`);
  }
  return n;
}
