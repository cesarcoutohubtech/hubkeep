// Porta das bandeiras (fase 1a, A2). Implementada por packages/db, com o
// contexto do usuário: a RLS mostra as bandeiras do tenant e só deixa o Admin
// do grupo gravar.
import type { Contexto } from '@hubkeep/dominio';

export interface BandeiraCadastrada {
  id: string;
  nome: string;
  ativa: boolean;
}

export interface PortaBandeiras {
  listar(ctx: Contexto): Promise<BandeiraCadastrada[]>;
  buscar(ctx: Contexto, id: string): Promise<BandeiraCadastrada | null>;
  /** Na unit of work. Nome repetido no tenant: Conflito bandeira_nome_repetido. */
  criar(ctx: Contexto, nome: string): Promise<{ id: string }>;
  renomear(ctx: Contexto, id: string, nome: string): Promise<void>;
  definirAtiva(ctx: Contexto, id: string, ativa: boolean): Promise<void>;
  /** Troca (ou tira, com null) a bandeira do hotel. Lança NaoEncontrado se nada mudou. */
  definirBandeiraDoHotel(ctx: Contexto, hotelId: string, bandeiraId: string | null): Promise<void>;
}
