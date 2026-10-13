// Porta dos avisos de SLA em aberto (fase 1c; ADR-043, M4). Implementada por
// packages/db, com o contexto do usuário: a RLS de app.sla_alerta só mostra
// os avisos à gestão do hotel, e a de app.chamado, os chamados que ele lê.
import type { AvisoGravado, Contexto, EstadoDoChamado, MotivoDePausa } from '@hubkeep/dominio';

/** O chamado em curso com prazo, e os avisos já gravados para ele. */
export interface ChamadoComAvisos {
  id: string;
  hotelId: string;
  descricao: string;
  estado: EstadoDoChamado;
  prioridadeId: string | null;
  categoriaId: string | null;
  /** A cópia das políticas na abertura (ADR-042), para saber se a pausa parou o relógio. */
  politicaAplicada: unknown;
  /** A OS do chamado em pausa agora, com o motivo da última pausa; null sem OS pausada. */
  pausaEmCurso: { motivo: MotivoDePausa | null } | null;
  /** Já teve OS, de qualquer estado: o atendimento foi cumprido ou perdido. */
  jaTeveOs: boolean;
  prazoAtendimento: Date | null;
  prazoSolucao: Date | null;
  gravados: AvisoGravado[];
}

export interface PortaAvisosDeSla {
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Os chamados em curso do hotel com algum prazo, com os avisos gravados. */
  chamadosDoHotel(ctx: Contexto, hotelId: string): Promise<ChamadoComAvisos[]>;
  /** O chamado, se quem pede o lê, com a bandeira do hotel. */
  chamado(
    ctx: Contexto,
    chamadoId: string,
  ): Promise<(ChamadoComAvisos & { bandeiraId: string | null }) | null>;
}
