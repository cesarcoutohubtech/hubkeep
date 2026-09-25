// Porta de convites, implementada por packages/db sobre o contexto de quem
// convida: tudo o que ela lê ou grava passa pela RLS.
import type { Contexto, Escopo, Papel } from '@hubkeep/dominio';

export interface SituacaoDoConvite {
  /** Nome do tenant do contexto; null se quem convida não é membro ativo dele. */
  nomeTenant: string | null;
  /** O escopo pedido existe e é visível para quem convida? */
  escopoVisivel: boolean;
  /** Já existe membro com este e-mail no tenant? */
  jaMembro: boolean;
}

export interface GravacaoDoConvite {
  usuarioId: string;
  nome: string;
  email: string;
  papel: Papel;
  escopo: Escopo;
  validoAte: Date | null;
  /** Vai no payload do evento membro.convidado, que o worker usa para enviar o e-mail. */
  convite: { nomeTenant: string; redirecionarPara: string };
}

export interface PortaConvites {
  situacao(ctx: Contexto, pedido: { email: string; escopo: Escopo }): Promise<SituacaoDoConvite>;
  /**
   * Numa só unit of work: membro, atribuição, auditoria e o evento
   * membro.convidado. Lança Conflito se o usuário já for membro (por id).
   */
  gravar(ctx: Contexto, gravacao: GravacaoDoConvite): Promise<void>;
}
