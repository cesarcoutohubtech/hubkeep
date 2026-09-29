// Portas das situações e prioridades do tenant (fase 1a, C1; ADR-027).
// Implementadas por packages/db, com o contexto do usuário: lê quem tem papel
// vigente no tenant (inclusive o proprietário); grava só o Admin do grupo (RLS).
import type { Contexto, EntidadeComSituacao } from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';

export interface SituacaoGravada {
  id: string;
  entidade: EntidadeComSituacao;
  estado: string;
  chavePadrao: string | null;
  /** Como está no banco; o caso de uso normaliza na leitura. */
  nomes: unknown;
  ordem: number;
  cor: string;
  ativa: boolean;
}

export interface PrioridadeGravada {
  id: string;
  chavePadrao: string | null;
  nomes: unknown;
  ordem: number;
  peso: number;
  ativa: boolean;
}

export interface PortaSituacoes {
  /** Idioma padrão do tenant, para a volta dos nomes (ADR-027). */
  idiomaPadrao(ctx: Contexto): Promise<Idioma>;
  listar(ctx: Contexto): Promise<SituacaoGravada[]>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    s: {
      entidade: EntidadeComSituacao;
      estado: string;
      chavePadrao: string | null;
      nomes: object;
      ordem: number;
      cor: string;
    },
  ): Promise<{ id: string }>;
  /** Na unit of work. Nada alterado (RLS): NaoEncontrado situacao_nao_encontrada. */
  alterar(
    ctx: Contexto,
    id: string,
    mudanca: { nomes: object; ordem: number; cor: string } | { ativa: boolean },
  ): Promise<void>;
}

export interface PortaPrioridades {
  listar(ctx: Contexto): Promise<PrioridadeGravada[]>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    p: { chavePadrao: string | null; nomes: object; ordem: number; peso: number },
  ): Promise<{ id: string }>;
  /** Na unit of work. Nada alterado (RLS): NaoEncontrado prioridade_nao_encontrada. */
  alterar(
    ctx: Contexto,
    id: string,
    mudanca: { nomes: object; ordem: number; peso: number } | { ativa: boolean },
  ): Promise<void>;
}
