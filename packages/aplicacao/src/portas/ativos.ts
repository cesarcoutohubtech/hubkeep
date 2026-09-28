// Porta dos ativos do hotel (fase 1a, B3). Implementada por packages/db, com o
// contexto do usuário: a RLS mostra os ativos dos hotéis que ele lê (e os dos
// locais do proprietário) e só deixa gravar quem tem escrita no hotel.
import type { Contexto, StatusDeLocal, ValorDeCampo } from '@hubkeep/dominio';

export interface AtivoGravado {
  id: string;
  hotelId: string;
  localId: string;
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  /** Como está no banco; a leitura passa por lerValores com a categoria. */
  campos: unknown;
  versao: number;
  desativadoEm: Date | null;
}

/** O que uma gravação (cadastro ou alteração) escreve, já validado pelo domínio. */
export interface DadosDeAtivo {
  categoriaId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  campos: Record<string, ValorDeCampo>;
}

export type MudancaDeAtivo = DadosDeAtivo | { desativado: boolean };

export interface PortaAtivos {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  local(
    ctx: Contexto,
    localId: string,
  ): Promise<{ id: string; hotelId: string; status: StatusDeLocal } | null>;
  /** Categorias do tenant, com as definições como estão no banco. */
  categorias(ctx: Contexto): Promise<{ id: string; ativa: boolean; campos: unknown }[]>;
  ativos(ctx: Contexto, hotelId: string): Promise<AtivoGravado[]>;
  ativo(ctx: Contexto, ativoId: string): Promise<AtivoGravado | null>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    hotelId: string,
    localId: string,
    dados: DadosDeAtivo,
  ): Promise<{ id: string; versao: number }>;
  /**
   * Na unit of work, só se a versão ainda for a esperada (ADR-029). Versão
   * diferente: Conflito conflito_de_versao; nada visível para alterar (RLS):
   * NaoEncontrado ativo_nao_encontrado.
   */
  alterar(
    ctx: Contexto,
    ativoId: string,
    versaoEsperada: number,
    mudanca: MudancaDeAtivo,
  ): Promise<{ versao: number }>;
}
