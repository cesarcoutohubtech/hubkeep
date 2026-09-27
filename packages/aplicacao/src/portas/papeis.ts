// Portas dos casos de uso de hotéis e papéis. Implementadas por packages/db
// (criarPortasDeAplicacao), sempre com o contexto do usuário: o que cada uma
// devolve já vem recortado pela RLS.
import type { Atribuicao, Contexto, PedidoDeConcessao } from '@hubkeep/dominio';

export interface Relogio {
  agora(): Date;
}

export interface HotelVisivel {
  id: string;
  nome: string;
  status: 'em_implantacao' | 'ativo' | 'desativado';
  bandeiraId: string | null;
}

export interface PortaHoteis {
  listarVisiveis(ctx: Contexto): Promise<HotelVisivel[]>;
}

export interface PortaAtribuicoes {
  /** Todas as atribuições do próprio usuário do contexto (a regra filtra as vigentes). */
  doUsuario(ctx: Contexto): Promise<Atribuicao[]>;
  /** Uma atribuição do tenant, se visível para quem pergunta; senão null. */
  buscar(ctx: Contexto, id: string): Promise<Atribuicao | null>;
  /** Grava a concessão na unit of work (auditoria + evento). A RLS é a última palavra. */
  conceder(ctx: Contexto, pedido: PedidoDeConcessao): Promise<{ id: string }>;
  /** Marca a revogação na unit of work. Lança NaoEncontrado se nada foi revogado. */
  revogar(ctx: Contexto, id: string): Promise<void>;
}
