// Porta das categorias de ativo (fase 1a, B2; ADR-028). Implementada por
// packages/db, com o contexto do usuário: lê quem tem papel vigente no tenant
// (inclusive o proprietário); grava só o Admin do grupo (RLS).
import type { Contexto } from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';

export interface CategoriaGravada {
  id: string;
  chavePadrao: string | null;
  /** Como está no banco; o caso de uso normaliza na leitura. */
  nomes: unknown;
  campos: unknown;
  ativa: boolean;
}

export interface PortaCategorias {
  /** Idioma padrão do tenant, para a volta dos nomes (ADR-027). */
  idiomaPadrao(ctx: Contexto): Promise<Idioma>;
  listar(ctx: Contexto): Promise<CategoriaGravada[]>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    c: { chavePadrao: string | null; nomes: object; campos: object[] },
  ): Promise<{ id: string }>;
  /** Na unit of work. Nada alterado (RLS): NaoEncontrado categoria_nao_encontrada. */
  alterar(
    ctx: Contexto,
    id: string,
    mudanca: { nomes: object; campos: object[] } | { ativa: boolean },
  ): Promise<void>;
}
