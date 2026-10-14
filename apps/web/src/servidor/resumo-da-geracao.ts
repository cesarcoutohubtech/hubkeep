// O resultado da geração da OS preventiva de um tenant (PV3; ADR-041), para a
// rota /api/cron/preventiva. Cada hotel gera na transação dele, e o que falha
// num hotel não derruba o tenant: a falha vai para o log e para o Sentry, com
// o tenant e o hotel, e a resposta da rota soma só números (as geradas, as
// puladas por motivo e os hotéis que falharam). A OS que saiu sem checklist,
// porque o modelo do plano foi desativado, vai para o log como aviso, com o
// plano, o ativo e o modelo (condição do adendo da PV3 ao ADR-041).
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
  for (const o of r.semChecklist) {
    deps.registrar('warn', 'cron.preventiva.checklist_modelo_inativo', {
      tenant_id: tenantId,
      hotel_id: o.hotelId,
      plano_id: o.planoId,
      ativo_id: o.ativoId,
      modelo_id: o.modeloId,
    });
  }
  return {
    hoteis: r.hoteis,
    planos: r.planos,
    geradas: r.geradas,
    hoteisComFalha: r.falhas.length,
    semChecklist: r.semChecklist.length,
    ...Object.fromEntries(Object.entries(r.puladas).map(([m, n]) => [`puladas_${m}`, n])),
  };
}
