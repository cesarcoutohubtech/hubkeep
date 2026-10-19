// Porta das sugestões de plano (fase 1b, M1, caminho C). Implementada por
// packages/db, com o contexto do usuário: a RLS mostra os ativos do hotel e
// os modelos do grupo; o descarte grava no ativo pela policy de escrita do
// hotel. O hotel e os planos vêm da porta dos planos preventivos.
import type { AtivoParaSugestao, Contexto } from '@hubkeep/dominio';

export interface AtivoComSugestao extends AtivoParaSugestao {
  hotelId: string;
  nome: string;
  versao: number;
}

export interface ModeloDaSugestao {
  id: string;
  nome: string;
  /** Como está gravado; o caso de uso lê pelo domínio (lerPlanoSugerido). */
  planoSugerido: unknown;
  checklistModeloId: string | null;
  /** O checklist do modelo está ativo; null: sem checklist, ou quem lê não o vê. */
  checklistAtivo: boolean | null;
}

export interface PortaSugestoesDePlano {
  /** Os ativos do hotel que têm modelo, pela RLS. */
  ativos(ctx: Contexto, hotelId: string): Promise<AtivoComSugestao[]>;
  ativo(ctx: Contexto, id: string): Promise<AtivoComSugestao | null>;
  modelos(ctx: Contexto, ids: readonly string[]): Promise<ModeloDaSugestao[]>;
  /**
   * Na unit of work, pela versão do ativo (ADR-029), com quem e quando do
   * contexto. Outra versão: Conflito conflito_de_versao; sem linha visível ou
   * gravável: NaoEncontrado ativo_nao_encontrado.
   */
  descartar(
    ctx: Contexto,
    ativoId: string,
    versaoEsperada: number,
    motivo: string,
  ): Promise<{ versao: number }>;
}
