// Geração da OS preventiva (fase 1b, PV3; ADR-041), por tenant, no cron
// /api/cron/preventiva, uma vez por dia. Para cada hotel ativo, numa
// transação dele: os planos ativos, os ativos do alvo e as OS que o plano já
// gerou; a regra (planejarGeracao, no domínio) decide o que gerar e o que
// pular, no dia do fuso do hotel. Um hotel que falha não segura os outros:
// a falha volta no resultado, e a próxima execução tenta de novo.
import { MOTIVOS_DE_PULO, type MotivoDePulo, diaNoFuso, planejarGeracao } from '@hubkeep/dominio';
import type { PortaGeracaoPreventiva } from '../portas/geracao-preventiva';
import type { Relogio } from '../portas/papeis';

export interface ResultadoDaGeracao {
  hoteis: number;
  planos: number;
  geradas: number;
  /** As puladas por motivo; "ja_gerada" inclui a ocorrência que outra execução gravou antes. */
  puladas: Record<MotivoDePulo, number>;
  /** Os hotéis em que a transação falhou, com a mensagem do erro. */
  falhas: { hotelId: string; erro: string }[];
}

export function criarGeracaoDePreventivas(deps: {
  geracao: PortaGeracaoPreventiva;
  relogio: Relogio;
}): (tenantId: string) => Promise<ResultadoDaGeracao> {
  return async (tenantId) => {
    const agora = deps.relogio.agora();
    const r: ResultadoDaGeracao = {
      hoteis: 0,
      planos: 0,
      geradas: 0,
      puladas: Object.fromEntries(MOTIVOS_DE_PULO.map((m) => [m, 0])) as Record<
        MotivoDePulo,
        number
      >,
      falhas: [],
    };
    for (const hotel of await deps.geracao.hoteisAtivos(tenantId)) {
      r.hoteis++;
      const hoje = diaNoFuso(agora, hotel.fuso);
      try {
        const doHotel = await deps.geracao.noHotel({ tenantId, hotelId: hotel.id }, async (s) => {
          const parcial = { planos: 0, geradas: 0, puladas: [] as MotivoDePulo[] };
          for (const plano of await s.planosAtivos()) {
            parcial.planos++;
            const ativos = (await s.ativosDoAlvo(plano.id)).map((a) => ({
              id: a.id,
              localId: a.localId,
              cadastradoEm: diaNoFuso(a.criadoEm, hotel.fuso),
            }));
            const plan = planejarGeracao({
              plano: { ...plano, responsavel: plano.responsavelValido ? plano.responsavel : null },
              ativos,
              geradas: await s.geradas(plano.id),
              hoje,
            });
            parcial.puladas.push(...plan.puladas.map((p) => p.motivo));
            for (const os of plan.geradas) {
              if (await s.gerar(os)) parcial.geradas++;
              else parcial.puladas.push('ja_gerada');
            }
          }
          return parcial;
        });
        r.planos += doHotel.planos;
        r.geradas += doHotel.geradas;
        for (const m of doHotel.puladas) r.puladas[m]++;
      } catch (e) {
        r.falhas.push({ hotelId: hotel.id, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    return r;
  };
}
