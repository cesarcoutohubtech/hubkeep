// Porta da parada do equipamento (fase 1a, C5). Implementada por packages/db,
// com o contexto do usuário (RLS da migração 0025). A parada nasce junto com o
// chamado (DadosDeChamado.paradaDesde) ou na execução, pelas operações offline
// (SessaoDeOperacao); o encerramento pelo web é uma unit of work própria, com
// auditoria e evento.
import type { Contexto } from '@hubkeep/dominio';

export interface ParadaGravada {
  id: string;
  hotelId: string;
  ativoId: string;
  chamadoId: string;
  /** A OS em que foi registrada, na execução; null se nasceu com o chamado. */
  osId: string | null;
  inicio: Date;
  /** null: o ativo ainda está parado. */
  fim: Date | null;
  abertaPor: string;
  encerradaPor: string | null;
}

/** Parada aberta com a OS do chamado já concluída (ou aceita), para a gestão acompanhar. */
export interface ParadaPendente extends ParadaGravada {
  hotel: { id: string; bandeiraId: string | null };
  ativoNome: string;
  /** A OS concluída (ou aceita) do chamado da parada. */
  os: { id: string; estado: string };
}

/** A parada registrada na execução, já validada. */
export interface RegistroDeParada {
  hotelId: string;
  ativoId: string;
  chamadoId: string;
  osId: string;
  inicio: Date;
  fim: Date | null;
}

/** O encerramento da parada aberta, já validado. */
export interface EncerramentoDeParada {
  id: string;
  hotelId: string;
  fim: Date;
}

export interface PortaParadas {
  parada(ctx: Contexto, paradaId: string): Promise<ParadaGravada | null>;
  /** A parada aberta do ativo, se houver e for visível (RLS). */
  abertaDoAtivo(ctx: Contexto, ativoId: string): Promise<ParadaGravada | null>;
  /** As paradas do ativo, da mais nova para a mais antiga. */
  doAtivo(ctx: Contexto, ativoId: string): Promise<ParadaGravada[]>;
  /**
   * As paradas abertas visíveis (RLS) cujo chamado tem OS num dos estados
   * pedidos (os de OS concluída, do domínio), da mais antiga para a mais nova.
   */
  abertasComOs(ctx: Contexto, estadosDaOs: readonly string[]): Promise<ParadaPendente[]>;
  /**
   * Na unit of work, só se ainda aberta: senão Conflito parada_nao_aberta; a
   * RLS recusa quem não encerra (NaoEncontrado parada_nao_encontrada).
   */
  encerrar(ctx: Contexto, e: EncerramentoDeParada): Promise<void>;
}
