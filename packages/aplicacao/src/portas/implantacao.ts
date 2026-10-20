// Porta do painel de implantação (fase 1a, A5). Implementada por packages/db,
// com o contexto do usuário: hotel e locais vêm recortados pela RLS. As
// pessoas vêm da porta de membros (A3), que já recorta as atribuições.
import type {
  AtivoParaImplantacao,
  Contexto,
  LocalParaImplantacao,
  ModeloContratual,
  MudancaDeSituacaoDoHotel,
  PlanoQueCobre,
} from '@hubkeep/dominio';

export interface HotelEmImplantacao {
  id: string;
  nome: string;
  status: string;
  /** I2: nulo é "não informado", e o painel aponta a pendência. */
  modeloContratual: ModeloContratual | null;
}

export interface HotelDaPorta extends HotelEmImplantacao {
  /** O hotel nasce em implantação: a entrada, quando a auditoria não tem. */
  criadoEm: Date;
}

export interface PortaImplantacao {
  /** Hotel visível a quem pede; senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<HotelDaPorta | null>;
  locais(ctx: Contexto, hotelId: string): Promise<LocalParaImplantacao[]>;
  ativos(ctx: Contexto, hotelId: string): Promise<AtivoParaImplantacao[]>;
  /** Os planos do hotel, pela RLS, para o contador de ativos com modelo e sem plano (M1). */
  planos(ctx: Contexto, hotelId: string): Promise<PlanoQueCobre[]>;
  /**
   * As mudanças de situação do hotel na auditoria (importação e ativação),
   * para o tempo de implantação (PB1, sem migração).
   */
  mudancasDeSituacao(ctx: Contexto, hotelId: string): Promise<MudancaDeSituacaoDoHotel[]>;
}
