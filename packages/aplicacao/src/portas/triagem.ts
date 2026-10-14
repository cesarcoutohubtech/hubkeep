// Porta da triagem e da OS (fase 1a, C3; aceite na C6). Implementada por
// packages/db, com o contexto do usuário: a RLS mostra o chamado e as OS dos
// hotéis que ele lê e só deixa gravar os papéis da triagem (migração 0022) e,
// no aceite, também quem abriu o chamado (0026). Toda gravação é uma
// unit of work, com auditoria e evento, e confere a versão (ADR-029). Na I4,
// a OS guarda quem executa (equipe interna ou fornecedor do grupo) e o custo
// informado no aceite, e o chamado, o impacto no hóspede. Na I6, a OS guarda
// os códigos de falha, causa e solução, sugeridos na conclusão e confirmados
// no aceite. Na 1c (ADR-045), a OS do hotel arrendado guarda quem responde
// por ela e a hora do aviso ao locador. Na PV3c (ADR-041), a OS preventiva,
// sem chamado, passa pelas mesmas ações: o hotel vem da OS, e o reflexo no
// chamado e a versão do chamado ficam nulos.
import type {
  Atribuicao,
  CodigosDaOs,
  Contexto,
  DadosDoAceite,
  EstadoDaOs,
  EstadoDoChamado,
  ExecutadoPor,
  ModeloContratual,
  QuemExecuta,
  Responsavel,
  ResponsavelDoArrendamento,
} from '@hubkeep/dominio';
import type { DadosDoCalendario } from './calendario-sla';

export interface ChamadoParaTriagem {
  id: string;
  hotel: { id: string; bandeiraId: string | null };
  /** O modelo contratual do hotel (I2): no arrendado, a OS nasce com a marca (ADR-045). */
  modeloContratual: ModeloContratual | null;
  localId: string;
  /** O ativo do chamado, se houver (a parada da C5 só existe com ele). */
  ativoId: string | null;
  estado: EstadoDoChamado;
  situacaoId: string;
  prioridadeId: string;
  abertoPor: string;
  versao: number;
  /** O que o recálculo dos prazos lê (1c, ADR-042). */
  sla: {
    categoriaId: string | null;
    abertoEm: Date;
    /** Como está no banco: a cópia da abertura, com a chamado.sla e o horário. */
    politicaAplicada: unknown;
    prazoAtendimento: Date | null;
    prazoSolucao: Date | null;
    pausadoSegundos: number;
    /** O chamado já teve OS, de qualquer estado: o prazo de atendimento não muda mais. */
    jaTeveOs: boolean;
  };
}

/** A OS preventiva (PV3, ADR-041): o plano, o ativo e a data prevista da ocorrência. */
export interface PreventivaDaOs {
  planoId: string;
  ativoId: string;
  /** AAAA-MM-DD, no fuso do hotel. */
  dataPrevista: string;
}

export interface OsGravada {
  id: string;
  hotelId: string;
  /** A bandeira do hotel da OS, que a regra de papel olha (OrigemDaOs). */
  bandeiraId: string | null;
  /** O chamado da corretiva; null na preventiva. */
  chamadoId: string | null;
  /** A preventiva; null na corretiva. */
  preventiva: PreventivaDaOs | null;
  estado: EstadoDaOs;
  situacaoId: string;
  responsavel: Responsavel;
  motivoCancelamento: string | null;
  /** O último motivo de reabertura (C6); o histórico fica na auditoria. */
  motivoReabertura: string | null;
  /** Quem executa (I4): a equipe interna ou o fornecedor do grupo. */
  executadoPor: ExecutadoPor;
  fornecedorId: string | null;
  /** O custo informado no aceite, em reais (I4); null: não informado. */
  custoInformado: number | null;
  /** Falha, causa e solução (I6); null em cada um: não informado. */
  codigos: CodigosDaOs;
  /** O anexo da assinatura do último aceite (I8); null: aceite sem assinatura. */
  assinaturaAceiteId: string | null;
  /** Quem responde pela OS no hotel arrendado (ADR-045); null: sem marca. */
  responsavelArrendamento: ResponsavelDoArrendamento | null;
  /** A hora do aviso ao locador, que sai uma vez por OS (ADR-045). */
  locadorAvisadoEm: Date | null;
  /** Quem gerou a OS; null na preventiva, que o worker gera. */
  criadoPor: string | null;
  versao: number;
  criadoEm: Date;
}

/** A OS da corretiva: sempre com chamado e autor (check os_de_um_tipo, 0048). */
export type OsDaCorretiva = OsGravada & { chamadoId: string; criadoPor: string };

/** O que muda no chamado, já decidido pelo domínio. */
export interface MudancaNoChamado {
  acao: 'triar' | 'priorizar' | 'categorizar' | 'cancelar' | 'informar_impacto';
  estado?: EstadoDoChamado;
  situacaoId?: string;
  prioridadeId?: string;
  /** A categoria do chamado (1c, ADR-042); null tira a categoria. */
  categoriaId?: string | null;
  motivoCancelamento?: string;
  /** Afeta hóspede? (I4) null: não informado. */
  impactoHospede?: boolean | null;
  /** Os prazos refeitos na troca de prioridade ou de categoria (1c, ADR-042); a auditoria guarda antes e depois. */
  prazoAtendimento?: Date;
  prazoSolucao?: Date;
  /**
   * No cancelamento (I4): encerra nesta hora o período aberto da UH do
   * chamado, se houver, na mesma unit of work.
   */
  encerrarUhEm?: Date;
}

/** O reflexo da ação da OS no chamado (estado e situação), com a versão lida. */
export interface ReflexoNoChamado {
  id: string;
  versao: number;
  estado: EstadoDoChamado;
  situacaoId: string;
}

/** A assinatura do aceite (I8): o PNG já enviado, com o caminho conferido. */
export interface AssinaturaDoAceite {
  hotelId: string;
  caminho: string;
}

export interface PortaTriagem {
  chamado(ctx: Contexto, chamadoId: string): Promise<ChamadoParaTriagem | null>;
  /** Todas as OS do chamado, da mais antiga para a mais nova. */
  osDoChamado(ctx: Contexto, chamadoId: string): Promise<OsDaCorretiva[]>;
  os(ctx: Contexto, osId: string): Promise<OsGravada | null>;
  /** Atribuições da pessoa visíveis a quem pergunta (a triagem lê as de Técnico nos hotéis dela). */
  atribuicoesDe(ctx: Contexto, usuarioId: string): Promise<Atribuicao[]>;
  equipe(ctx: Contexto, equipeId: string): Promise<{ hotelId: string; ativa: boolean } | null>;
  /** O fornecedor do grupo visível a quem pede (I3), para a triagem escolher; senão null. */
  fornecedor(ctx: Contexto, fornecedorId: string): Promise<{ ativo: boolean } | null>;
  /** Valor gravado da política no hotel e no grupo, como está no banco (a resolução é do domínio). */
  politica(
    ctx: Contexto,
    hotelId: string,
    chave: string,
  ): Promise<{ hotel?: unknown; grupo?: unknown }>;
  /** O fuso, a região e os feriados do hotel, para o calendário de SLA (1c); hotel invisível: null. */
  calendario(ctx: Contexto, hotelId: string): Promise<DadosDoCalendario | null>;
  /** Equipes ativas de que quem pede é membro ativo (o aceite confere se ele executa a OS). */
  equipesDoUsuario(ctx: Contexto): Promise<string[]>;
  /**
   * Para o aceite (DadosDoAceite): as equipes ativas de quem abriu o chamado e
   * as atribuições de Gerente não revogadas, de membro ativo, que podem cobrir
   * o hotel (grupo, bandeira do hotel ou o hotel), visíveis a quem pede (0027).
   * Na preventiva, sem quem abriu, as equipes vêm vazias.
   */
  dadosDoAceite(
    ctx: Contexto,
    g: { hotel: { id: string; bandeiraId: string | null }; abertoPor: string | null },
  ): Promise<DadosDoAceite>;
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
      /** Quem executa (I4); sem escolha na triagem, a equipe interna. */
      execucao: QuemExecuta;
      /** A marca do arrendamento, já decidida pelo domínio (ADR-045); null: sem marca. */
      arrendamento: ResponsavelDoArrendamento | null;
      /** A OS nasce do locador: grava a hora do aviso e publica os.locador_avisado. */
      avisarLocador: boolean;
    },
  ): Promise<{ id: string; versao: number; versaoDoChamado: number }>;
  /**
   * Ajusta a marca do arrendamento (ADR-045), com o motivo na auditoria. Com
   * `avisarLocador`, grava a hora do aviso e publica os.locador_avisado.
   */
  ajustarArrendamento(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      arrendamento: ResponsavelDoArrendamento;
      motivo: string;
      avisarLocador: boolean;
    },
  ): Promise<{ versao: number }>;
  /** Corrige quem executa a OS (I4), na unit of work, com auditoria e evento. */
  definirQuemExecuta(
    ctx: Contexto,
    g: { osId: string; versao: number; execucao: QuemExecuta },
  ): Promise<{ versao: number }>;
  reatribuirOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      /** O estado lido na versão conferida: a transição grava de → para (I5). */
      de: EstadoDaOs;
      situacaoId: string;
      responsavel: Responsavel;
    },
  ): Promise<{ versao: number }>;
  cancelarOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      de: EstadoDaOs;
      situacaoId: string;
      motivo: string;
      /** null na preventiva, que não tem chamado. */
      chamado: ReflexoNoChamado | null;
    },
  ): Promise<{ versao: number; versaoDoChamado: number | null }>;
  /**
   * Aceite (C6): a OS concluída fica aceita, e o chamado, concluído. Com o
   * custo informado (I4), a OS o guarda. Com os códigos (I6), a OS grava os
   * três; null: ficam os que já estão. Com a assinatura (I8), o anexo é
   * registrado na mesma unit of work e a OS guarda o id; null: a OS fica sem.
   */
  aceitarOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      de: EstadoDaOs;
      situacaoId: string;
      /** null na preventiva, que não tem chamado. */
      chamado: ReflexoNoChamado | null;
      custoInformado: number | null;
      codigos: CodigosDaOs | null;
      assinatura: AssinaturaDoAceite | null;
    },
  ): Promise<{ versao: number; versaoDoChamado: number | null }>;
  /**
   * Reabertura (C6): a mesma OS volta à execução, com o motivo na OS (o
   * último) e na auditoria. Com `parada`, abre a parada do ativo no mesmo
   * chamado; se o ativo já tem uma aberta, fica a que existe (paradaId nulo).
   */
  reabrirOs(
    ctx: Contexto,
    g: {
      osId: string;
      versao: number;
      de: EstadoDaOs;
      situacaoId: string;
      motivo: string;
      /** null na preventiva, que não tem chamado (nem parada). */
      chamado: ReflexoNoChamado | null;
      parada: { hotelId: string; ativoId: string; inicio: Date } | null;
    },
  ): Promise<{ versao: number; versaoDoChamado: number | null; paradaId: string | null }>;
}
