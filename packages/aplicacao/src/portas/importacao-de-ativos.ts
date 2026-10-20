// Porta da importação de ativos por planilha (fase 1b, M2; migração 0058).
// Implementada por packages/db, com o contexto do usuário: a RLS mostra o que
// o usuário lê e só deixa gravar quem tem escrita no hotel; a chave de
// importação é única por hotel no banco.
import type { AtivoDaImportacao, Contexto, LocalDaImportacao } from '@hubkeep/dominio';

export interface CategoriaParaImportar {
  id: string;
  ativa: boolean;
  /** Como estão no banco; a leitura passa por lerDefinicoes. */
  campos: unknown;
  /** Os nomes por idioma, como estão no banco. */
  nomes: unknown;
  /** A categoria padrão tem o nome no catálogo. */
  chavePadrao: string | null;
}

export interface ModeloParaImportar {
  id: string;
  categoriaId: string;
  nome: string;
  ativa: boolean;
  /** PB1b: nulo vale para o grupo. */
  bandeiraId: string | null;
  fabricante: string | null;
  modelo: string | null;
  campos: unknown;
}

export interface PortaImportacaoDeAtivos {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  /** Todos os locais do hotel, os inativos inclusive (para a recusa dizer o porquê). */
  locais(ctx: Contexto, hotelId: string): Promise<LocalDaImportacao[]>;
  categorias(ctx: Contexto): Promise<CategoriaParaImportar[]>;
  modelos(ctx: Contexto): Promise<ModeloParaImportar[]>;
  /** As chaves de importação dos ativos do hotel. */
  chaves(ctx: Contexto, hotelId: string): Promise<string[]>;
  /**
   * Na unit of work, como o cadastro do ativo (auditoria e evento ativo.criado),
   * aprovado e com a chave. A chave que outro envio gravou nesse meio-tempo dá
   * 'ja_importada', sem gravar nada.
   */
  criar(
    ctx: Contexto,
    hotelId: string,
    a: AtivoDaImportacao,
  ): Promise<{ id: string } | 'ja_importada'>;
}
