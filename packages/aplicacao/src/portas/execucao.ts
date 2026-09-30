// Porta da execução da OS (fase 1a, C4). Implementada por packages/db, com o
// contexto do usuário. As gravações vão pelas operações offline do PWA
// (SessaoDeOperacao, ADR-025); aqui ficam as leituras.
import type { Contexto, EstadoDaOs, EstadoDoChamado, Responsavel } from '@hubkeep/dominio';
import type { EncerramentoDeParada } from './paradas';

/** Uma OS da fila do dia do Técnico, com o que a tela precisa do chamado. */
export interface OsDoDia {
  id: string;
  hotelId: string;
  estado: EstadoDaOs;
  situacaoId: string;
  responsavel: Responsavel;
  versao: number;
  criadoEm: Date;
  chamado: {
    id: string;
    descricao: string;
    localId: string;
    localNome: string;
    prioridadeId: string;
    estado: EstadoDoChamado;
    /** O ativo do chamado (C5): sem ele, não há parada. */
    ativoId: string | null;
    /** Início da parada aberta do ativo do chamado (C5); null se não está parado. */
    paradoDesde: Date | null;
    /** A parada aberta é deste chamado (a OS pode encerrar, e a conclusão pergunta). */
    paradaDoChamado: boolean;
  };
}

export interface PortaExecucao {
  /** Equipes ativas de que o usuário do contexto é membro ativo. */
  equipesDoUsuario(ctx: Contexto): Promise<string[]>;
  /** OS atribuídas, em execução ou pausadas do usuário e das equipes dele. */
  osDoDia(ctx: Contexto): Promise<OsDoDia[]>;
}

/** Ação do Técnico sobre a OS, já decidida pelo domínio. */
export interface AcaoNaOsDecidida {
  acao: 'iniciar' | 'pausar' | 'retomar' | 'concluir';
  osId: string;
  versao: number;
  estado: EstadoDaOs;
  situacaoId: string;
  /** O reflexo no chamado (concluir), com a versão lida no servidor; senão null. */
  chamado: { id: string; versao: number; estado: EstadoDoChamado; situacaoId: string } | null;
  /** Concluir com "o equipamento voltou a funcionar": a parada a encerrar na mesma operação. */
  encerrarParada?: EncerramentoDeParada | null;
}
