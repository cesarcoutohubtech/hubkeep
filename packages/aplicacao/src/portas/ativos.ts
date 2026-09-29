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
  /** Código do QR individual (B5), gerado no cadastro e imutável. */
  codigoQr: string;
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

/** Uma movimentação do ativo entre locais do hotel (B3c). */
export interface MovimentacaoDeAtivo {
  id: string;
  localOrigemId: string;
  localDestinoId: string;
  usuarioId: string;
  /** Nome de quem moveu, quando o membro é visível a quem lê (RLS de app.membro). */
  nomeUsuario: string | null;
  movidoEm: Date;
}

export interface PortaAtivos {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  local(
    ctx: Contexto,
    localId: string,
  ): Promise<{ id: string; hotelId: string; status: StatusDeLocal } | null>;
  /** Categorias do tenant, com as definições como estão no banco. */
  categorias(ctx: Contexto): Promise<{ id: string; ativa: boolean; campos: unknown }[]>;
  /** Com `termo` (já normalizado, B6), só os que o têm na coluna `busca`. */
  ativos(ctx: Contexto, hotelId: string, termo?: string): Promise<AtivoGravado[]>;
  ativo(ctx: Contexto, ativoId: string): Promise<AtivoGravado | null>;
  /** O ativo do código do QR no tenant do contexto, se visível (RLS); senão null. */
  ativoPorCodigoQr(ctx: Contexto, codigoQr: string): Promise<AtivoGravado | null>;
  /** Na unit of work, com auditoria e evento; o código do QR é gerado aqui. */
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
  /**
   * Na unit of work, só se a versão ainda for a esperada (ADR-029): troca o
   * local e grava a movimentação (origem, destino, quem), a auditoria e o
   * evento. Mesmas recusas de alterar.
   */
  mover(
    ctx: Contexto,
    ativoId: string,
    versaoEsperada: number,
    localDestinoId: string,
  ): Promise<{ versao: number }>;
  /** Movimentações do ativo, da mais nova para a mais velha (RLS: quem lê o hotel). */
  movimentacoes(ctx: Contexto, ativoId: string): Promise<MovimentacaoDeAtivo[]>;
}
