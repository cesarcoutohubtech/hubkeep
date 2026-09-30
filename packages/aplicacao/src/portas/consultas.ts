// Porta das consultas da corretiva (fase 1a, C7): as listas de chamados e OS,
// os nomes do detalhe e a linha do tempo do chamado. Implementada por
// packages/db, com o contexto do usuário: a RLS mostra só o escopo dele, e o
// nome que ele não lê (hotel, local, ativo, pessoa, equipe) volta null.
import type {
  Contexto,
  EntidadeDaLinhaDoTempo,
  EstadoDaOs,
  EstadoDoChamado,
  FiltroDaLista,
  Responsavel,
} from '@hubkeep/dominio';

export interface ChamadoResumido {
  id: string;
  hotelId: string;
  hotelNome: string | null;
  localId: string;
  localNome: string | null;
  ativoId: string | null;
  ativoNome: string | null;
  descricao: string;
  estado: EstadoDoChamado;
  situacaoId: string;
  prioridadeId: string;
  criadoEm: Date;
}

export interface OsResumida {
  id: string;
  hotelId: string;
  hotelNome: string | null;
  chamadoId: string;
  localNome: string | null;
  /** Do chamado; null se quem pede lê a OS e não o chamado. */
  descricao: string | null;
  prioridadeId: string | null;
  estado: EstadoDaOs;
  situacaoId: string;
  responsavel: Responsavel;
  /** Nome do Técnico ou da equipe responsável. */
  responsavelNome: string | null;
  criadoEm: Date;
}

/** Os nomes que o detalhe do chamado mostra no lugar dos ids. */
export interface NomesDoChamado {
  hotel: string | null;
  local: string | null;
  ativo: string | null;
  /** Quem abriu e os Técnicos das OS, por usuário. */
  pessoas: Record<string, string>;
  /** As equipes das OS, por id. */
  equipes: Record<string, string>;
}

/** Uma ação da auditoria do chamado, das OS dele ou das paradas do chamado. */
export interface EventoDaLinhaDoTempo {
  id: string;
  em: Date;
  entidade: EntidadeDaLinhaDoTempo;
  registroId: string;
  acao: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  /** O motivo do cancelamento ou da reabertura, se a ação tem. */
  motivo: string | null;
}

export interface PortaConsultasDaCorretiva {
  /** Os chamados visíveis no filtro, do mais novo para o mais antigo, até `limite`. */
  chamados(ctx: Contexto, filtro: FiltroDaLista, limite: number): Promise<ChamadoResumido[]>;
  /** As OS visíveis no filtro (a prioridade é a do chamado), da mais nova para a mais antiga. */
  os(ctx: Contexto, filtro: FiltroDaLista, limite: number): Promise<OsResumida[]>;
  /** null se o chamado não é visível a quem pede. */
  nomesDoChamado(ctx: Contexto, chamadoId: string): Promise<NomesDoChamado | null>;
  /** Da mais antiga para a mais nova; só o que a auditoria mostra a quem pede (RLS). */
  linhaDoTempo(ctx: Contexto, chamadoId: string): Promise<EventoDaLinhaDoTempo[]>;
}
