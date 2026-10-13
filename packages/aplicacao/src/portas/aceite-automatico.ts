// Porta do aceite automático (fase 1c, M5; ADR-044). Implementada por
// packages/db com o hk_worker, um tenant por transação (ADR-007): lê as OS
// corretivas concluídas, com a última conclusão, quem abriu o chamado e as
// equipes dele, e grava o aceite sem autor (a OS, a transição
// aceitar_automatico e o reflexo no chamado), com a auditoria e o evento
// os.aceita, na mesma transação.
import type { NiveisDePolitica, OsNoAceiteAutomatico, SituacaoParaRegra } from '@hubkeep/dominio';
import type { ReflexoNoChamado } from './triagem';

export interface OsParaOAceiteAutomatico extends OsNoAceiteAutomatico {
  id: string;
  hotelId: string;
  versao: number;
  chamadoId: string;
  versaoDoChamado: number;
}

export interface AceiteAutomaticoAGravar {
  osId: string;
  hotelId: string;
  versao: number;
  situacaoId: string;
  chamado: ReflexoNoChamado;
  /** Para a auditoria: a conclusão de que a contagem partiu e os dias da política. */
  concluidaEm: Date;
  dias: number;
}

export interface SessaoDoAceiteAutomatico {
  /** As OS corretivas concluídas do tenant, da conclusão mais antiga para a mais nova. */
  osConcluidas(): Promise<OsParaOAceiteAutomatico[]>;
  /** O valor gravado da política no hotel, na bandeira e no grupo (a resolução é do domínio). */
  politica(hotelId: string, chave: string): Promise<NiveisDePolitica>;
  situacoes(): Promise<SituacaoParaRegra[]>;
  /** Grava o aceite; false se a OS ou o chamado mudaram de versão (fica para a rodada seguinte). */
  aceitar(a: AceiteAutomaticoAGravar): Promise<boolean>;
}

export interface PortaAceiteAutomatico {
  emSessao<T>(tenantId: string, fn: (s: SessaoDoAceiteAutomatico) => Promise<T>): Promise<T>;
}
