// O resultado da geração da OS preventiva de um tenant (PV3; ADR-041), para a
// rota /api/cron/preventiva. Cada hotel gera na transação dele, e o que falha
// num hotel não derruba o tenant: a falha vai para o log e para o Sentry, com
// o tenant e o hotel, e a resposta da rota soma só números (as geradas, as
// puladas por motivo e os hotéis que falharam).
import type { ResultadoDaGeracao } from '@hubkeep/aplicacao';
import type { Registrador } from './log';
import type { Relator } from './sentry';

export function resumirGeracao(
  tenantId: string,
  r: ResultadoDaGeracao,
  deps: { registrar: Registrador; relatar: Relator },
): Record<string, number> {
  for (const f of r.falhas) {
    deps.registrar('error', 'cron.preventiva.hotel_falhou', {
      tenant_id: tenantId,
      hotel_id: f.hotelId,
      erro: f.erro,
    });
    deps.relatar(new Error(f.erro), {
      tarefa: 'preventiva',
      tenant_id: tenantId,
      hotel_id: f.hotelId,
    });
  }
  return {
    hoteis: r.hoteis,
    planos: r.planos,
    geradas: r.geradas,
    hoteisComFalha: r.falhas.length,
    ...Object.fromEntries(Object.entries(r.puladas).map(([m, n]) => [`puladas_${m}`, n])),
  };
}
