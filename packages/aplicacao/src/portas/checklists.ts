// Porta do checklist tipado (fase 1b, PV1; ADR-040). Implementada por
// packages/db, com o contexto do usuário. O modelo: leem a gestão e o
// Implantador, grava só o Admin do grupo. A cópia na OS: lê quem lê a OS,
// aplica a gestão do hotel, altera a gestão e o Técnico responsável (RLS).
import type {
  Contexto,
  DefinicaoDeCampo,
  RespostaDoChecklist,
  Rotulos,
  ValorDeCampo,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';

export interface ModeloDeChecklistGravado {
  id: string;
  categoriaId: string | null;
  /** Como está no banco; o caso de uso normaliza na leitura. */
  nomes: unknown;
  itens: unknown;
  versao: number;
  ativa: boolean;
  /** PB1b: nulo vale para o grupo; não muda depois de criado. */
  bandeiraId: string | null;
}

export interface ChecklistDaOsGravado {
  id: string;
  osId: string;
  hotelId: string;
  modeloId: string;
  modeloVersao: number;
  nomes: unknown;
  itens: unknown;
  respostas: unknown;
}

/** A cópia na OS, lida pelo caso de uso: itens e respostas que valem (nunca lança). */
export interface ChecklistDaOs {
  id: string;
  osId: string;
  modeloId: string;
  modeloVersao: number;
  nomes: Rotulos;
  itens: DefinicaoDeCampo[];
  respostas: Record<string, RespostaDoChecklist>;
}

/** A cópia do modelo que vai para a OS (ADR-026). */
export interface AplicacaoDeChecklist {
  osId: string;
  hotelId: string;
  modelo: { id: string; versao: number; nomes: object; itens: object[] };
  /** A cópia sem resposta que o modelo novo substitui; null: a OS não tinha checklist. */
  substitui: string | null;
}

/** As respostas de uma operação, já validadas contra a cópia (null limpa o item). */
export interface RespostasDoChecklistDecididas {
  checklistId: string;
  osId: string;
  hotelId: string;
  respostas: Record<string, ValorDeCampo | null>;
  feitaEm: Date;
}

export interface PortaChecklists {
  /** Idioma padrão do tenant, para a volta dos nomes (ADR-027). */
  idiomaPadrao(ctx: Contexto): Promise<Idioma>;
  listarModelos(ctx: Contexto): Promise<ModeloDeChecklistGravado[]>;
  /** A bandeira existe e é visível a quem pede (PB1b). */
  bandeira(ctx: Contexto, id: string): Promise<boolean>;
  /** Na unit of work, com auditoria e evento. A bandeira só se escolhe aqui. */
  criarModelo(
    ctx: Contexto,
    m: { categoriaId: string | null; bandeiraId: string | null; nomes: object; itens: object[] },
  ): Promise<{ id: string }>;
  /** Na unit of work. Nada alterado (RLS): NaoEncontrado checklist_nao_encontrado. */
  alterarModelo(
    ctx: Contexto,
    id: string,
    mudanca:
      | { categoriaId: string | null; nomes: object; itens: object[]; versao: number }
      | { ativa: boolean },
  ): Promise<void>;
  /** A cópia na OS, se a OS tem checklist e quem pede vê a OS. */
  daOs(ctx: Contexto, osId: string): Promise<ChecklistDaOsGravado | null>;
  /** Grava a cópia (ou troca a sem resposta), na unit of work, com auditoria e evento. */
  aplicar(ctx: Contexto, a: AplicacaoDeChecklist): Promise<{ id: string }>;
}
