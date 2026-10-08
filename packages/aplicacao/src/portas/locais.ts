// Porta dos locais do hotel (fase 1a, B1). Implementada por packages/db, com o
// contexto do usuário: a RLS mostra os locais dos hotéis que ele lê (e as UHs
// do proprietário) e só deixa gravar quem tem escrita no hotel.
import type { Contexto, StatusDeLocal, TipoDeLocal } from '@hubkeep/dominio';

export interface LocalDoHotel {
  id: string;
  hotelId: string;
  nome: string;
  tipo: TipoDeLocal;
  andar: string | null;
  /** Torre, bloco (I2); editável também na UH do sistema hoteleiro. */
  edificacao: string | null;
  status: StatusDeLocal;
  /** Código no sistema hoteleiro; nulo no local cadastrado à mão. */
  codExterno: string | null;
}

export type MudancaDeLocal =
  | { nome: string; andar: string | null; edificacao?: string | null }
  | { edificacao: string | null }
  | { status: 'ativo' | 'inativo' };

export interface PortaLocais {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Com `termo` (já normalizado, B6), só os que o têm na coluna `busca` (nome e edificação). */
  locais(ctx: Contexto, hotelId: string, termo?: string): Promise<LocalDoHotel[]>;
  local(ctx: Contexto, localId: string): Promise<LocalDoHotel | null>;
  /** Na unit of work, com auditoria e evento. Área comum, ativa. */
  criarAreaComum(
    ctx: Contexto,
    hotelId: string,
    dados: { nome: string; andar: string | null; edificacao?: string | null },
  ): Promise<{ id: string }>;
  /**
   * Na unit of work. Nada alterado (RLS): NaoEncontrado local_nao_encontrado.
   * Na mudança de nome e andar, a edificação ausente fica a gravada.
   */
  alterar(ctx: Contexto, localId: string, mudanca: MudancaDeLocal): Promise<void>;
}
