// Porta das equipes do hotel (fase 1a, A6). Implementada por packages/db, com
// o contexto do usuário: a RLS mostra as equipes dos hotéis que ele lê e só
// deixa gravar quem gerencia equipes no hotel.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';

export interface EquipeDoHotel {
  id: string;
  nome: string;
  ativa: boolean;
  membros: { usuarioId: string; nome: string; ativo: boolean }[];
}

export interface PortaEquipes {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Hotel da equipe, se o usuário a enxerga; senão null. */
  hotelDaEquipe(
    ctx: Contexto,
    equipeId: string,
  ): Promise<{ id: string; bandeiraId: string | null } | null>;
  listar(
    ctx: Contexto,
    hotelId: string,
  ): Promise<{
    equipes: EquipeDoHotel[];
    /** Membros ativos do tenant visíveis ao usuário, para escolher quem entra. */
    disponiveis: { usuarioId: string; nome: string }[];
  }>;
  /**
   * Atribuições de Técnico do tenant, não revogadas, visíveis ao usuário. O
   * caso de uso filtra as vigentes que cobrem o hotel (ehTecnicoDoHotel).
   */
  atribuicoesDeTecnico(ctx: Contexto): Promise<Atribuicao[]>;
  /** Na unit of work. Nome repetido no hotel: Conflito equipe_nome_repetido. */
  criar(ctx: Contexto, hotelId: string, nome: string): Promise<{ id: string }>;
  renomear(ctx: Contexto, equipeId: string, nome: string): Promise<void>;
  definirAtiva(ctx: Contexto, equipeId: string, ativa: boolean): Promise<void>;
  /** Põe (ou reativa) ou tira o membro da equipe. */
  definirMembro(ctx: Contexto, equipeId: string, usuarioId: string, ativo: boolean): Promise<void>;
}
