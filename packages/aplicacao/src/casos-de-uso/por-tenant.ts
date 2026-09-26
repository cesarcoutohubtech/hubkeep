// Laço por tenant dos jobs de cron (ADR-007): um tenant por vez, cada um na
// própria transação, e um tenant com erro não bloqueia os outros (aceite da
// F0-09). O erro fica no resultado, para o log e o Sentry, e o laço segue.

export interface ResultadoPorTenant<R> {
  tenants: number;
  concluidos: { tenantId: string; resultado: R }[];
  falhas: { tenantId: string; erro: unknown }[];
}

export async function rodarPorTenant<R>(
  tenants: () => Promise<readonly string[]>,
  tarefa: (tenantId: string) => Promise<R>,
): Promise<ResultadoPorTenant<R>> {
  const lista = await tenants();
  const resultado: ResultadoPorTenant<R> = { tenants: lista.length, concluidos: [], falhas: [] };
  for (const tenantId of lista) {
    try {
      resultado.concluidos.push({ tenantId, resultado: await tarefa(tenantId) });
    } catch (erro) {
      resultado.falhas.push({ tenantId, erro });
    }
  }
  return resultado;
}
