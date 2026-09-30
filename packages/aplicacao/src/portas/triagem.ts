// Porta da triagem e da OS (fase 1a, C3; aceite na C6). Implementada por
// packages/db, com o contexto do usuário: a RLS mostra o chamado e as OS dos
// hotéis que ele lê e só deixa gravar os papéis da triagem (migração 0022) e,
// no aceite, também quem abriu o chamado (0026). Toda gravação é uma
// unit of work, com auditoria e evento, e confere a versão (ADR-029).
import type {
  Atribuicao,
  Contexto,
  EstadoDaOs,
  EstadoDoChamado,
  Responsavel,
} from '@hubkeep/dominio';

export interface ChamadoParaTriagem {
  id: string;
  hotel: { id: string; bandeiraId: string | null };
  localId: string;
  estado: EstadoDoChamado;
  situacaoId: string;
  prioridadeId: string;
  abertoPor: string;
  versao: number;
}

export interface OsGravada {
  id: string;
  hotelId: string;
  chamadoId: string;
  estado: EstadoDaOs;
  situacaoId: string;
  responsavel: Responsavel;
  motivoCancelamento: string | null;
  criadoPor: string;
  versao: number;
  criadoEm: Date;
}

/** O que muda no chamado, já decidido pelo domínio. */
export interface MudancaNoChamado {
  acao: 'triar' | 'priorizar' | 'cancelar';
  estado?: EstadoDoChamado;
  situacaoId?: string;
  prioridadeId?: string;
  motivoCancelamento?: string;
}

/** O reflexo da ação da OS no chamado (estado e situação), com a versão lida. */
export interface ReflexoNoChamado {
  id: string;
  versao: number;
  estado: EstadoDoChamado;
  situacaoId: string;
}

export interface PortaTriagem {
  chamado(ctx: Contexto, chamadoId: string): Promise<ChamadoParaTriagem | null>;
  /** Todas as OS do chamado, da mais antiga para a mais nova. */
  osDoChamado(ctx: Contexto, chamadoId: string): Promise<OsGravada[]>;
  os(ctx: Contexto, osId: string): Promise<OsGravada | null>;
  /** Atribuições da pessoa visíveis a quem pergunta (a triagem lê as de Técnico nos hotéis dela). */
  atribuicoesDe(ctx: Contexto, usuarioId: string): Promise<Atribuicao[]>;
  equipe(ctx: Contexto, equipeId: string): Promise<{ hotelId: string; ativa: boolean } | null>;
  alterarChamado(
    ctx: Contexto,
    chamadoId: string,
    versao: number,
    mudanca: MudancaNoChamado,
  ): Promise<{ versao: number }>;
  /** Grava a OS e o reflexo no chamado; 409 os_em_andamento se o índice recusar. */
  gerarOs(
    ctx: Contexto,
    g: {
      chamado: ReflexoNoChamado;
      hotelId: string;
      /** O local do chamado, que a OS guarda para a leitura do proprietário (0024). */
      localId: string;
      /** Quem abriu o chamado, que a OS guarda para o UPDATE do aceite (0026). */
      chamadoAbertoPor: string;
      situacaoId: string;
      responsavel: Responsavel;
    },
  ): Promise<{ id: string; versao: number; versaoDoChamado: number }>;
  reatribuirOs(
    ctx: Contexto,
    g: { osId: string; versao: number; situacaoId: string; responsavel: Responsavel },
  ): Promise<{ versao: number }>;
  cancelarOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      situacaoId: string;
      motivo: string;
      chamado: ReflexoNoChamado;
    },
  ): Promise<{ versao: number; versaoDoChamado: number }>;
  /** Aceite (C6): a OS concluída fica aceita, e o chamado, concluído. */
  aceitarOs(
    ctx: Contexto,
    g: { osId: string; versao: number; situacaoId: string; chamado: ReflexoNoChamado },
  ): Promise<{ versao: number; versaoDoChamado: number }>;
  /** Reabertura (C6): a mesma OS volta à execução, com o motivo na auditoria. */
  reabrirOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      situacaoId: string;
      motivo: string;
      chamado: ReflexoNoChamado;
    },
  ): Promise<{ versao: number; versaoDoChamado: number }>;
}
