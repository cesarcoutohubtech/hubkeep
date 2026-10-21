// Porta da situação por hotel da tela inicial (1c, seção 4 da paridade).
// Implementada por packages/db, com o contexto do usuário: a RLS decide que
// OS e chamados ele lê. Os chamados em curso, com os avisos, vêm da porta dos
// avisos de SLA; os hotéis e a tolerância da preventiva, da dos indicadores.
import type { Contexto, EstadoDaOs } from '@hubkeep/dominio';

/** Uma OS preventiva aberta, com a data prevista no dia local do hotel. */
export interface PreventivaAberta {
  hotelId: string;
  /** aaaa-mm-dd */
  dataPrevista: string;
  estado: EstadoDaOs;
}

export interface PortaSituacaoPorHotel {
  /** As OS preventivas abertas agora nos hotéis, com a data prevista até `ateDia`, inclusive. */
  preventivasAbertas(
    ctx: Contexto,
    hotelIds: readonly string[],
    ateDia: string,
  ): Promise<PreventivaAberta[]>;
  /** A abertura dos chamados não cancelados dos hotéis, desde `desde`. */
  aberturas(
    ctx: Contexto,
    hotelIds: readonly string[],
    desde: Date,
  ): Promise<{ hotelId: string; abertoEm: Date }[]>;
}
