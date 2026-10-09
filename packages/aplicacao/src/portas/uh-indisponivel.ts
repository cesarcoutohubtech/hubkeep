// Porta da UH indisponível (fase 1b, I4). Implementada por packages/db, com o
// contexto do usuário (RLS da migração 0034). O período nasce com o chamado
// (DadosDeChamado.uhIndisponivelDesde) ou depois, pela gestão do hotel; a
// liberação vem na conclusão da OS (SessaoDeOperacao) ou pela gestão, pelo
// web. Toda gravação é uma unit of work, com auditoria e evento.
import type { Contexto } from '@hubkeep/dominio';

export interface PeriodoDeUhGravado {
  id: string;
  hotelId: string;
  localId: string;
  chamadoId: string;
  inicio: Date;
  /** null: a UH ainda está indisponível. */
  fim: Date | null;
  abertaPor: string;
  encerradaPor: string | null;
}

/** O período marcado depois da abertura, já validado. */
export interface MarcacaoDeUh {
  hotelId: string;
  localId: string;
  chamadoId: string;
  inicio: Date;
}

/** A liberação do período aberto, já validada. */
export interface LiberacaoDeUh {
  id: string;
  hotelId: string;
  fim: Date;
}

export interface PortaUhIndisponivel {
  periodo(ctx: Contexto, periodoId: string): Promise<PeriodoDeUhGravado | null>;
  /** O período aberto do chamado, se houver e for visível (RLS). */
  abertoDoChamado(ctx: Contexto, chamadoId: string): Promise<PeriodoDeUhGravado | null>;
  /** Os períodos do chamado, do mais novo para o mais antigo. */
  doChamado(ctx: Contexto, chamadoId: string): Promise<PeriodoDeUhGravado[]>;
  /**
   * Na unit of work, em nome do usuário do contexto. Outro aberto no chamado
   * (índice): Conflito uh_indisponivel_ja_aberta.
   */
  marcar(ctx: Contexto, m: MarcacaoDeUh): Promise<{ id: string }>;
  /**
   * Na unit of work, só se ainda aberto: senão Conflito
   * uh_indisponivel_nao_aberta; a RLS recusa quem não libera (NaoEncontrado
   * uh_indisponivel_nao_encontrada).
   */
  liberar(ctx: Contexto, l: LiberacaoDeUh): Promise<void>;
}
