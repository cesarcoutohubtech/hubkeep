// Porta dos chamados (fase 1a, C2). Implementada por packages/db, com o
// contexto do usuário: a RLS mostra os chamados dos hotéis que ele lê (e os
// das UHs e do hotel inteiro do proprietário) e só deixa abrir quem tem
// escrita no hotel, em nome dele mesmo.
import type { Contexto, OrigemDoChamado, StatusDeLocal, TipoDeLocal } from '@hubkeep/dominio';
import type { DadosDoCalendario } from './calendario-sla';

export interface ChamadoGravado {
  id: string;
  hotelId: string;
  localId: string;
  ativoId: string | null;
  descricao: string;
  estado: string;
  situacaoId: string;
  prioridadeId: string;
  /** Como está no banco: a cópia da política aplicada na abertura (ADR-026). */
  politicaAplicada: unknown;
  abertoPor: string;
  motivoCancelamento: string | null;
  /** De onde veio o trabalho (I4); sem UPDATE. */
  origem: string;
  /** Afeta hóspede? null: não informado (I4). */
  impactoHospede: boolean | null;
  /** A categoria do chamado (1c, ADR-042): do ativo na abertura, ajustável na triagem. */
  categoriaId: string | null;
  /** Os prazos de SLA (ADR-042); nulos no chamado de antes da 0043. */
  prazoAtendimento: Date | null;
  prazoSolucao: Date | null;
  /** O tempo de relógio parado por pausas, em segundos (ADR-042). */
  pausadoSegundos: number;
  versao: number;
  criadoEm: Date;
}

/** O que a abertura grava, já validado e resolvido pela aplicação. */
export interface DadosDeChamado {
  localId: string;
  ativoId: string | null;
  descricao: string;
  estado: 'aberto';
  situacaoId: string;
  prioridadeId: string;
  politicaAplicada: object;
  /** A categoria do chamado, do ativo na abertura (1c, ADR-042). */
  categoriaId: string | null;
  /** Os prazos de SLA calculados da abertura (ADR-042). */
  prazoAtendimento: Date;
  prazoSolucao: Date;
  /** De onde veio o trabalho (I4): na abertura pelo web e pelo PWA, sempre interno. */
  origem: OrigemDoChamado;
  /** Afeta hóspede? null: não informado (I4). */
  impactoHospede: boolean | null;
  /**
   * A UH indisponível desde (I4): grava o período aberto da UH do chamado
   * junto com ele. Só em chamado de UH.
   */
  uhIndisponivelDesde: Date | null;
  /**
   * O equipamento parado desde (C5): grava a parada aberta do ativo junto com
   * o chamado. Se o ativo já tem parada aberta, fica a que existe.
   */
  paradaDesde: Date | null;
}

export interface PortaChamados {
  /** Hotel visível ao usuário, com a bandeira (para a regra de escopo); senão null. */
  hotel(ctx: Contexto, hotelId: string): Promise<{ id: string; bandeiraId: string | null } | null>;
  local(
    ctx: Contexto,
    localId: string,
  ): Promise<{ id: string; hotelId: string; tipo: TipoDeLocal; status: StatusDeLocal } | null>;
  ativo(
    ctx: Contexto,
    ativoId: string,
  ): Promise<{
    id: string;
    hotelId: string;
    localId: string;
    categoriaId: string | null;
    desativadoEm: Date | null;
  } | null>;
  /** Valor gravado da política no hotel e no grupo, como está no banco (a resolução é do domínio). */
  politica(
    ctx: Contexto,
    hotelId: string,
    chave: string,
  ): Promise<{ hotel?: unknown; grupo?: unknown }>;
  /** O fuso, a região e os feriados do hotel, para o calendário de SLA (1c); hotel invisível: null. */
  calendario(ctx: Contexto, hotelId: string): Promise<DadosDoCalendario | null>;
  /** Na unit of work, com auditoria e evento; `aberto_por` é o usuário do contexto. */
  criar(
    ctx: Contexto,
    hotelId: string,
    dados: DadosDeChamado,
  ): Promise<{ id: string; versao: number }>;
  chamado(ctx: Contexto, chamadoId: string): Promise<ChamadoGravado | null>;
}
