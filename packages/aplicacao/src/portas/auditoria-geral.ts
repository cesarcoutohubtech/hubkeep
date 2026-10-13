// Porta da auditoria geral (fase 1c). Implementada por packages/db, com o
// contexto do usuário: a RLS de app.auditoria decide que linhas ele lê
// (ADR-021), e a consulta fica só com os hotéis em que ele é da gestão
// (decisão 12 do Cesar de 13/10/2026), pelas mesmas funções authz.* das
// policies. As linhas sem hotel continuam só pela RLS.
import type { Contexto, CursorDaAuditoria } from '@hubkeep/dominio';

export interface FiltroDaAuditoria {
  de: Date;
  ate: Date;
  hotelId: string | null;
  entidade: string | null;
  acao: string | null;
  /** O id da pessoa, ou 'sistema' para as linhas gravadas por job. */
  pessoa: string | null;
}

/** Uma linha de app.auditoria, como a RLS a mostra, com os nomes que quem pede lê. */
export interface LinhaDaAuditoriaGeral {
  id: string;
  em: Date;
  /** O `em` exato, em UTC e com os microssegundos, para o cursor (CursorDaAuditoria). */
  emExato: string;
  hotelId: string | null;
  /** null sem hotel, ou se quem pede não lê o hotel. */
  hotelNome: string | null;
  entidade: string;
  registroId: string;
  acao: string;
  usuarioId: string | null;
  /** null se quem pede não lê o membro ou se foi um job. */
  usuarioNome: string | null;
  antes: unknown;
  depois: unknown;
}

export interface PortaAuditoriaGeral {
  /**
   * Até `limite` linhas do filtro, da mais nova para a mais antiga (em, id), a
   * partir do cursor (exclusive).
   */
  pagina(
    ctx: Contexto,
    filtro: FiltroDaAuditoria,
    depoisDe: CursorDaAuditoria | null,
    limite: number,
  ): Promise<LinhaDaAuditoriaGeral[]>;
}
