// Porta do histórico de um registro (fase 1a, D1). Implementada por
// packages/db, com o contexto do usuário: a RLS de cada tabela decide se o
// registro existe para ele, a de app.auditoria decide que linhas ele lê, e o
// nome que ele não lê (pessoa, equipe, local) fica de fora das referências.
import type { Contexto, EntidadeComHistorico, TipoDeReferencia } from '@hubkeep/dominio';
import type { Idioma, NomesPorIdioma } from '@hubkeep/i18n';

/** Uma linha de app.auditoria do registro, como a RLS a mostra. */
export interface LinhaDeAuditoria {
  id: string;
  em: Date;
  acao: string;
  usuarioId: string | null;
  /** null se quem pede não lê o membro (o proprietário) ou foi um job. */
  usuarioNome: string | null;
  antes: unknown;
  depois: unknown;
}

/** O nome de um registro apontado por uma mudança. */
export type ReferenciaDoHistorico =
  | { tipo: 'pessoa' | 'equipe' | 'local' | 'ativo' | 'bandeira'; nome: string }
  | {
      tipo: 'situacao' | 'prioridade' | 'categoria';
      chavePadrao: string | null;
      nomes: NomesPorIdioma;
    };

export interface PortaHistorico {
  /** O registro existe para o usuário do contexto (RLS da tabela dele)? */
  registroVisivel(
    ctx: Contexto,
    entidade: EntidadeComHistorico,
    registroId: string,
  ): Promise<boolean>;
  /** As linhas da auditoria do registro, da mais antiga para a mais nova. */
  linhas(
    ctx: Contexto,
    entidade: EntidadeComHistorico,
    registroId: string,
  ): Promise<LinhaDeAuditoria[]>;
  /** Os nomes que o usuário lê, dos ids pedidos; os outros ficam de fora. */
  referencias(
    ctx: Contexto,
    ids: ReadonlyMap<string, TipoDeReferencia>,
  ): Promise<Record<string, ReferenciaDoHistorico>>;
  idiomaPadrao(ctx: Contexto): Promise<Idioma>;
}
