// Porta do pacote da bandeira (fase 1b, PB1; migração 0059). Implementada por
// packages/db, com o contexto do usuário: a RLS mostra os planos do pacote ao
// Admin do grupo e a quem gere o hotel ou o implanta, só deixa o Admin gravar,
// e o plano copiado entra no hotel pela policy de app.plano_preventivo.
import type {
  ChecklistParaPlanoPadrao,
  Contexto,
  CopiaDoPlanoPadrao,
  Periodicidade,
  PlanoPadrao,
} from '@hubkeep/dominio';

export interface PlanoPadraoGravado extends PlanoPadrao {
  versao: number;
}

export interface DadosDoPlanoPadrao {
  categoriaId: string;
  nome: string;
  intervalo: number;
  unidade: Periodicidade['unidade'];
  checklistModeloId: string | null;
}

export type MudancaDePlanoPadrao = DadosDoPlanoPadrao | { ativa: boolean };

export interface PortaPacoteDaBandeira {
  /** Os planos do pacote que quem pede enxerga (RLS), os desativados inclusive. */
  planos(ctx: Contexto): Promise<PlanoPadraoGravado[]>;
  plano(ctx: Contexto, id: string): Promise<PlanoPadraoGravado | null>;
  /** A bandeira do tenant, se existe; senão null. */
  bandeira(ctx: Contexto, id: string): Promise<{ id: string } | null>;
  categoria(ctx: Contexto, id: string): Promise<{ id: string; ativa: boolean } | null>;
  checklist(ctx: Contexto, id: string): Promise<ChecklistParaPlanoPadrao | null>;
  /** Na unit of work, com auditoria e evento. */
  criar(
    ctx: Contexto,
    d: DadosDoPlanoPadrao & { bandeiraId: string | null },
  ): Promise<{ id: string }>;
  /**
   * Na unit of work, pela versão (ADR-029); a versão sobe. Outra versão:
   * Conflito conflito_de_versao; sem linha gravável: NaoEncontrado
   * plano_padrao_nao_encontrado.
   */
  alterar(
    ctx: Contexto,
    id: string,
    versaoEsperada: number,
    mudanca: MudancaDePlanoPadrao,
  ): Promise<{ versao: number }>;
  /** Hotel visível, com a bandeira (o que vale para ele) e o fuso (o dia da cópia). */
  hotel(
    ctx: Contexto,
    hotelId: string,
  ): Promise<{ id: string; bandeiraId: string | null; fuso: string } | null>;
  /** De que planos do pacote o hotel já tem cópia. */
  copiados(ctx: Contexto, hotelId: string): Promise<string[]>;
  /**
   * Na unit of work, como o cadastro do plano (auditoria e evento). A cópia que
   * outro envio gravou nesse meio-tempo dá 'ja_copiado', sem gravar nada.
   */
  copiar(
    ctx: Contexto,
    hotelId: string,
    c: CopiaDoPlanoPadrao,
  ): Promise<{ id: string } | 'ja_copiado'>;
}
