// Porta do painel de implantação (fase 1a, A5). Implementada por packages/db,
// com o contexto do usuário: hotel e locais vêm recortados pela RLS. As
// pessoas vêm da porta de membros (A3), que já recorta as atribuições.
import type {
  AtivoParaImplantacao,
  Contexto,
  LocalParaImplantacao,
  ModeloContratual,
} from '@hubkeep/dominio';

export interface HotelEmImplantacao {
  id: string;
  nome: string;
  status: string;
  /** I2: nulo é "não informado", e o painel aponta a pendência. */
  modeloContratual: ModeloContratual | null;
}

export interface PortaImplantacao {
  /** Hotel visível a quem pede; senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<HotelEmImplantacao | null>;
  locais(ctx: Contexto, hotelId: string): Promise<LocalParaImplantacao[]>;
  ativos(ctx: Contexto, hotelId: string): Promise<AtivoParaImplantacao[]>;
}
