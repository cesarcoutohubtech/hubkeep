// Porta do monitor de SLA (fase 1c; ADR-043). Implementada por packages/db
// com o hk_worker, um tenant por transação (ADR-007): lê os chamados em curso
// com prazo, as prioridades, as políticas e o calendário de cada hotel, e
// grava o aviso em app.sla_alerta, uma vez por chamado, tipo e prazo, com o
// evento chamado.sla_alerta no outbox, na mesma transação.
import type {
  DestinatarioDoAviso,
  EstadoDoChamado,
  MotivoDePausa,
  NiveisDePolitica,
  NivelDoAviso,
  PrioridadeParaSla,
  TipoDeAlertaDeSla,
} from '@hubkeep/dominio';
import type { DadosDoCalendario } from './calendario-sla';

export interface ChamadoParaMonitor {
  id: string;
  hotelId: string;
  estado: EstadoDoChamado;
  prioridadeId: string;
  categoriaId: string | null;
  /** Como está no banco: a cópia da abertura, com a chamado.sla e o horário. */
  politicaAplicada: unknown;
  prazoAtendimento: Date | null;
  prazoSolucao: Date | null;
  jaTeveOs: boolean;
  /** A OS em curso está pausada: o motivo da última pausa (null sem motivo); sem pausa, null. */
  pausaEmCurso: { motivo: MotivoDePausa | null } | null;
  /** Os tipos de aviso já emitidos para os prazos de agora. */
  emitidos: TipoDeAlertaDeSla[];
}

export interface AvisoAEmitir {
  hotelId: string;
  chamadoId: string;
  tipo: TipoDeAlertaDeSla;
  nivel: NivelDoAviso;
  prazo: Date;
  destinatarios: readonly DestinatarioDoAviso[];
}

export interface SessaoDoMonitor {
  /** Os chamados com prazo de SLA ainda em curso (aberto, em triagem ou em execução). */
  chamadosEmCurso(): Promise<ChamadoParaMonitor[]>;
  prioridades(): Promise<PrioridadeParaSla[]>;
  /** O valor gravado da política no hotel, na bandeira e no grupo (a resolução é do domínio). */
  politica(hotelId: string, chave: string): Promise<NiveisDePolitica>;
  calendario(hotelId: string): Promise<DadosDoCalendario | null>;
  /** Grava o aviso e o evento; false se o aviso daquele prazo já existia. */
  emitir(aviso: AvisoAEmitir): Promise<boolean>;
}

export interface PortaMonitorDeSla {
  emSessao<T>(tenantId: string, fn: (s: SessaoDoMonitor) => Promise<T>): Promise<T>;
}
