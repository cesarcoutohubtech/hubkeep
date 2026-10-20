// Porta dos planos preventivos (fase 1b, PV2; ADR-041). Implementada por
// packages/db, com o contexto do usuário: a RLS mostra os planos dos hotéis
// em que ele é da gestão ou Implantador, e só deixa gravar esses mesmos. O
// responsável (Técnico e equipe) é conferido pela porta da triagem.
import type {
  Contexto,
  ResponsavelDoPlano,
  SituacaoDoPlano,
  UnidadeDePeriodicidade,
} from '@hubkeep/dominio';

export interface PlanoGravado {
  id: string;
  hotelId: string;
  ativoId: string | null;
  categoriaId: string | null;
  nome: string;
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
  /** aaaa-mm-dd */
  inicio: string;
  checklistModeloId: string | null;
  tecnicoId: string | null;
  equipeId: string | null;
  situacao: SituacaoDoPlano;
  versao: number;
}

/** Os dados que quem cadastra escolhe (o alvo, só na criação). */
export interface DadosDoPlano {
  nome: string;
  intervalo: number;
  unidade: UnidadeDePeriodicidade;
  inicio: string;
  checklistModeloId: string | null;
  tecnicoId: string | null;
  equipeId: string | null;
}

export interface NovoPlano extends DadosDoPlano {
  hotelId: string;
  ativoId: string | null;
  categoriaId: string | null;
  situacao: SituacaoDoPlano;
}

export interface PortaPlanosPreventivos {
  /** Hotel visível ao usuário, com a bandeira (regra de escopo) e o fuso (o dia do plano). */
  hotel(
    ctx: Contexto,
    hotelId: string,
  ): Promise<{ id: string; bandeiraId: string | null; fuso: string } | null>;
  /** Os planos do hotel, pela RLS (vazio para quem não é da gestão nem Implantador). */
  doHotel(ctx: Contexto, hotelId: string): Promise<PlanoGravado[]>;
  /** Os planos do ativo, pela RLS. */
  doAtivo(ctx: Contexto, ativoId: string): Promise<PlanoGravado[]>;
  plano(ctx: Contexto, id: string): Promise<PlanoGravado | null>;
  /** O ativo visível: o hotel e se está desativado. */
  ativo(ctx: Contexto, ativoId: string): Promise<{ hotelId: string; ativo: boolean } | null>;
  /** A categoria do grupo existe e está ativa. */
  categoriaExiste(ctx: Contexto, categoriaId: string): Promise<boolean>;
  /**
   * O que as pendências da tela do plano leem (PV3c), em lote: o responsável
   * padrão como a regra o enxerga e se o modelo de checklist está ativo (null:
   * sem modelo, ou quem lê não o vê).
   */
  conferencia(
    ctx: Contexto,
    planos: readonly PlanoGravado[],
  ): Promise<Map<string, { responsavel: ResponsavelDoPlano | null; modeloAtivo: boolean | null }>>;
  /** O modelo de checklist visível, e se está ativo. */
  /** PB1b: com a bandeira (nula: do grupo). */
  modeloDeChecklist(
    ctx: Contexto,
    id: string,
  ): Promise<{ ativa: boolean; bandeiraId: string | null } | null>;
  /** Na unit of work, com auditoria e evento. */
  criar(ctx: Contexto, p: NovoPlano): Promise<{ id: string; versao: number }>;
  /**
   * Na unit of work, pela versão (ADR-029): outra versão, Conflito
   * conflito_de_versao; sem linha visível ou gravável, NaoEncontrado
   * plano_nao_encontrado.
   */
  alterar(
    ctx: Contexto,
    id: string,
    versaoEsperada: number,
    mudanca: DadosDoPlano | { situacao: SituacaoDoPlano },
  ): Promise<{ versao: number }>;
}
