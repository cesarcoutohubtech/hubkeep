// Monitor de SLA (fase 1c; ADR-043), por tenant, no cron /api/cron/sla. Para
// cada chamado em curso com prazo: a regra de SLA sai da cópia do chamado; o
// calendário, do hotel de agora; o percentual e os destinatários, da
// política chamado.escalonamento do hotel. Os avisos devidos que ainda não
// saíram para os prazos de agora são gravados, com o evento no outbox. A
// pausa que parou o relógio (ADR-042) congela o aviso da solução.
import {
  type CalendarioDeSla,
  type EscalonamentoDeSla,
  avisosDeSla,
  destinatariosDoAviso,
  pausaDoChamadoParaORelogio,
  resolverPolitica,
  slaDoChamado,
} from '@hubkeep/dominio';
import type { FeriadosOficiais } from '../portas/calendario-sla';
import type { PortaMonitorDeSla } from '../portas/monitor-sla';
import type { Relogio } from '../portas/papeis';
import { montarCalendarioDeSla } from './calendario-sla';

export interface ResultadoDoMonitor {
  avaliados: number;
  emitidos: number;
}

export function criarMonitorDeSla(deps: {
  monitor: PortaMonitorDeSla;
  feriadosOficiais: FeriadosOficiais;
  relogio: Relogio;
}): (tenantId: string) => Promise<ResultadoDoMonitor> {
  return (tenantId) =>
    deps.monitor.emSessao(tenantId, async (s) => {
      const agora = deps.relogio.agora();
      const [chamados, prioridades] = await Promise.all([s.chamadosEmCurso(), s.prioridades()]);
      const escalonamentos = new Map<string, EscalonamentoDeSla>();
      const calendarios = new Map<string, CalendarioDeSla>();
      const dadosDosHoteis = new Map<string, Awaited<ReturnType<typeof s.calendario>>>();
      const escalonamento = async (hotelId: string) => {
        let e = escalonamentos.get(hotelId);
        if (!e) {
          e = resolverPolitica(
            'chamado.escalonamento',
            await s.politica(hotelId, 'chamado.escalonamento'),
          );
          escalonamentos.set(hotelId, e);
        }
        return e;
      };
      const dados = async (hotelId: string) => {
        if (!dadosDosHoteis.has(hotelId)) dadosDosHoteis.set(hotelId, await s.calendario(hotelId));
        return dadosDosHoteis.get(hotelId) ?? null;
      };

      let emitidos = 0;
      for (const c of chamados) {
        const sla = slaDoChamado({
          politicaAplicada: c.politicaAplicada,
          prioridadeId: c.prioridadeId,
          prioridades,
          categoriaId: c.categoriaId,
        });
        const doHotel = await dados(c.hotelId);
        if (!sla || !doHotel) continue;
        // Um calendário por hotel e cópia: as cópias do mesmo hotel quase sempre são iguais.
        const chave = `${c.hotelId}|${JSON.stringify(sla.copia['hotel.horario_atendimento'])}|${String(sla.copia['chamado.sla'].pontoFacultativo)}`;
        let calendario = calendarios.get(chave);
        if (!calendario) {
          calendario = montarCalendarioDeSla(deps.feriadosOficiais, doHotel, sla.copia, agora);
          calendarios.set(chave, calendario);
        }
        const e = await escalonamento(c.hotelId);
        const devidos = avisosDeSla({
          chamado: {
            estado: c.estado,
            jaTeveOs: c.jaTeveOs,
            prazoAtendimento: c.prazoAtendimento,
            prazoSolucao: c.prazoSolucao,
            relogioParado:
              c.pausaEmCurso !== null &&
              pausaDoChamadoParaORelogio(sla, c.prazoSolucao, c.pausaEmCurso.motivo),
          },
          regra: sla.regra,
          calendario,
          agora,
          percentualDoAviso: e.percentualDoAviso,
        });
        for (const a of devidos) {
          if (c.emitidos.includes(a.tipo)) continue;
          const novo = await s.emitir({
            hotelId: c.hotelId,
            chamadoId: c.id,
            tipo: a.tipo,
            nivel: a.nivel,
            prazo: a.prazo,
            destinatarios: destinatariosDoAviso(e, a.nivel),
          });
          if (novo) emitidos++;
        }
      }
      return { avaliados: chamados.length, emitidos };
    });
}
