// Porta da execução da OS (fase 1a, C4). Implementada por packages/db, com o
// contexto do usuário. As gravações vão pelas operações offline do PWA
// (SessaoDeOperacao, ADR-025); aqui ficam as leituras.
import type { Contexto, EstadoDaOs, EstadoDoChamado, Responsavel } from '@hubkeep/dominio';
import type { EncerramentoDeParada } from './paradas';
import type { LiberacaoDeUh } from './uh-indisponivel';

/** Uma OS da fila do dia do Técnico, com o que a tela precisa do chamado. */
export interface OsDoDia {
  id: string;
  hotelId: string;
  estado: EstadoDaOs;
  situacaoId: string;
  responsavel: Responsavel;
  /** O último motivo de reabertura (C6): o técnico vê por que a OS voltou. */
  motivoReabertura: string | null;
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
    /** Início do período aberto da UH do chamado (I4); null se a UH não está indisponível. */
    uhIndisponivelDesde: Date | null;
  };
}

export interface PortaExecucao {
  /** Equipes ativas de que o usuário do contexto é membro ativo. */
  equipesDoUsuario(ctx: Contexto): Promise<string[]>;
  /** OS atribuídas, em execução ou pausadas do usuário e das equipes dele. */
  osDoDia(ctx: Contexto): Promise<OsDoDia[]>;
  /** A hora da última transição da OS (I5); null se ela não tem nenhuma. */
  ultimaTransicaoEm(ctx: Contexto, osId: string): Promise<Date | null>;
}

/** Ação do Técnico sobre a OS, já decidida pelo domínio. */
export interface AcaoNaOsDecidida {
  acao: 'iniciar' | 'pausar' | 'retomar' | 'concluir';
  osId: string;
  versao: number;
  /** O estado lido na versão conferida: a transição grava de → para (I5). */
  de: EstadoDaOs;
  estado: EstadoDaOs;
  /** A hora da transição: a do aparelho, ajustada pelo domínio (I9). */
  quando: Date;
  situacaoId: string;
  /** O reflexo no chamado (concluir), com a versão lida no servidor; senão null. */
  chamado: { id: string; versao: number; estado: EstadoDoChamado; situacaoId: string } | null;
  /** Concluir com "o equipamento voltou a funcionar": a parada a encerrar na mesma operação. */
  encerrarParada?: EncerramentoDeParada | null;
  /** Concluir com "UH liberada" (I4): o período da UH a encerrar na mesma operação. */
  liberarUh?: LiberacaoDeUh | null;
}
