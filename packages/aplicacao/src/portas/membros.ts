// Porta da gestão de membros (fase 1a, A3). Implementada por packages/db, com
// o contexto do usuário: a lista e as atribuições vêm recortadas pela RLS (o
// Admin vê todas; o Implantador, as dos hotéis dele e as próprias).
import type { Atribuicao, Contexto } from '@hubkeep/dominio';

export interface MembroComAtribuicoes {
  usuarioId: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** Atribuições visíveis a quem pergunta, inclusive as revogadas e vencidas. */
  atribuicoes: Atribuicao[];
}

export interface PortaMembros {
  listar(ctx: Contexto): Promise<MembroComAtribuicoes[]>;
  /** Grava na unit of work (auditoria e evento). Lança NaoEncontrado se nada mudou. */
  definirAtivo(ctx: Contexto, usuarioId: string, ativo: boolean): Promise<void>;
  /** Grava na unit of work. Lança NaoEncontrado se a atribuição não foi alterada. */
  alterarValidade(ctx: Contexto, atribuicaoId: string, validoAte: Date | null): Promise<void>;
}
