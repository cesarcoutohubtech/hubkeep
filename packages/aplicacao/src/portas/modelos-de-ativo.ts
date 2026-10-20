// Porta dos modelos de ativo (fase 1b, M1; migração 0050). Implementada por
// packages/db, com o contexto do usuário. Leem quem cadastra ativo, inclusive
// o Técnico (o PWA baixa os modelos para cadastrar offline); grava só o Admin
// do grupo (RLS).
import type { Contexto, DadosDoModeloDeAtivo } from '@hubkeep/dominio';

export interface ModeloDeAtivoGravado {
  id: string;
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  /** Como está no banco; a leitura passa por lerValores com a categoria. */
  campos: unknown;
  checklistModeloId: string | null;
  /** Como está no banco; a leitura passa por lerPlanoSugerido. */
  planoSugerido: unknown;
  versao: number;
  ativa: boolean;
  /** PB1b: nulo vale para o grupo; não muda depois de criado. */
  bandeiraId: string | null;
}

export type MudancaDeModeloDeAtivo = DadosDoModeloDeAtivo | { ativa: boolean };

export interface PortaModelosDeAtivo {
  listar(ctx: Contexto): Promise<ModeloDeAtivoGravado[]>;
  /** Categorias do tenant, com as definições como estão no banco. */
  categorias(ctx: Contexto): Promise<{ id: string; ativa: boolean; campos: unknown }[]>;
  /** Os modelos de checklist que quem pede enxerga (a gestão e o Implantador). */
  checklists(
    ctx: Contexto,
  ): Promise<
    { id: string; ativa: boolean; categoriaId: string | null; bandeiraId: string | null }[]
  >;
  /** A bandeira existe e é visível a quem pede (PB1b). */
  bandeira(ctx: Contexto, id: string): Promise<boolean>;
  /** Na unit of work, com auditoria e evento. A bandeira só se escolhe aqui. */
  criar(
    ctx: Contexto,
    dados: DadosDoModeloDeAtivo,
    bandeiraId: string | null,
  ): Promise<{ id: string }>;
  /**
   * Na unit of work, só se a versão ainda for a esperada (ADR-029); a versão
   * sobe a cada gravação. Versão diferente: Conflito conflito_de_versao; nada
   * visível para alterar (RLS): NaoEncontrado modelo_ativo_nao_encontrado.
   */
  alterar(
    ctx: Contexto,
    id: string,
    versaoEsperada: number,
    mudanca: MudancaDeModeloDeAtivo,
  ): Promise<{ versao: number }>;
}
