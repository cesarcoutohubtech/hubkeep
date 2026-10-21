// Porta do cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da
// paridade). Implementada por packages/db, com o contexto do usuário.
import type { Contexto, VinculoDoProprietario } from '@hubkeep/dominio';

export interface PortaInicioDoProprietario {
  /** Os hotéis ativos de que quem pede é proprietário, pelo nome. */
  vinculos(ctx: Contexto): Promise<VinculoDoProprietario[]>;
}
