// Porta dos códigos de falha, causa e solução (fase 1b, I6). Implementada por
// packages/db, com o contexto do usuário: lê o Admin do grupo e quem lê algum
// hotel (inclusive o proprietário); grava só o Admin do grupo (RLS, 0036).
import type { Contexto, TipoDeCodigoDeManutencao } from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';

export interface CodigoGravado {
  id: string;
  tipo: TipoDeCodigoDeManutencao;
  categoriaId: string | null;
  chavePadrao: string | null;
  /** Como está no banco; o caso de uso normaliza na leitura. */
  nomes: unknown;
  ativa: boolean;
}

export interface PortaCodigos {
  /** Idioma padrão do tenant, para a volta dos nomes (ADR-027). */
  idiomaPadrao(ctx: Contexto): Promise<Idioma>;
  listar(ctx: Contexto): Promise<CodigoGravado[]>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    c: {
      tipo: TipoDeCodigoDeManutencao;
      categoriaId: string | null;
      chavePadrao: string | null;
      nomes: object;
    },
  ): Promise<{ id: string }>;
  /** Na unit of work. Nada alterado (RLS): NaoEncontrado codigo_nao_encontrado. */
  alterar(
    ctx: Contexto,
    id: string,
    mudanca: { nomes: object } | { ativa: boolean },
  ): Promise<void>;
  /**
   * A categoria do ativo, visível a quem pede; null se o ativo não tem
   * categoria ou se quem pede não o lê. Os códigos da OS são conferidos
   * contra ela.
   */
  categoriaDoAtivo(ctx: Contexto, ativoId: string): Promise<string | null>;
}
