// Pedido do histórico de demonstração do Intelligence (historico-demonstracao.ts),
// sem conexão: lê e confere o --fim, para o teste cobrir sem banco
// (tests/historico-inteligencia-ops.test.ts).
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O --fim (AAAA-MM-DD), o último dia do histórico. Sem ele, null: a gravação
 * usa o último dia cujo job já teria rodado. Com ele, só dia que já terminou
 * (antes de hoje, UTC); a gravação ainda confere que o job desse dia já teria
 * rodado.
 */
export function lerFimDoHistorico(
  argv: readonly string[],
  agora: Date = new Date(),
): string | null {
  const i = argv.indexOf('--fim');
  if (i < 0) return null;
  const fim = argv[i + 1] ?? '';
  const t = Date.parse(`${fim}T00:00:00Z`);
  if (!DIA.test(fim) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== fim) {
    throw new Error(`--fim precisa ser um dia AAAA-MM-DD (recebido: ${fim || 'nada'}).`);
  }
  if (fim >= agora.toISOString().slice(0, 10)) {
    throw new Error('--fim precisa ser um dia que já terminou: antes de hoje (UTC).');
  }
  return fim;
}
