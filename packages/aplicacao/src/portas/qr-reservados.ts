// Porta dos códigos de QR reservados (fase 1b, M3; migração 0061).
// Implementada por packages/db, com o contexto do usuário: a RLS mostra os
// códigos dos hotéis em que ele escreve e só deixa gerar ali, em nome próprio.
import type { CodigoReservado, Contexto } from '@hubkeep/dominio';

export interface CodigoDoLote {
  codigo: string;
  loteId: string;
  criadoEm: Date;
  /** Já existe ativo com o código: a etiqueta está ligada. */
  ligado: boolean;
}

export interface PortaQrReservados {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /**
   * Na unit of work, com auditoria e o evento qr.reservado: gera os códigos de
   * um lote novo, sem repetir código reservado nem de ativo visível.
   */
  reservar(
    ctx: Contexto,
    hotelId: string,
    quantidade: number,
  ): Promise<{ loteId: string; codigos: string[] }>;
  /** Os códigos do hotel, do lote mais novo para o mais velho. */
  codigos(ctx: Contexto, hotelId: string): Promise<CodigoDoLote[]>;
  /** O código reservado, se visível (RLS); senão null. */
  reserva(ctx: Contexto, codigo: string): Promise<CodigoReservado | null>;
}
