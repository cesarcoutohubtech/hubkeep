// Triagem e atribuição (fase 1a, C3). Quem tria e as transições do chamado e
// da OS são de corretiva.ts; aqui ficam quem pode receber a OS e o ajuste de
// prioridade. A RLS de app.os e do UPDATE de app.chamado (migração 0022)
// repete o "quem" pelo escopo; a elegibilidade do responsável é só daqui.
import {
  type AtorDaCorretiva,
  type ChamadoParaRegra,
  type EstadoDoChamado,
  type Responsavel,
  podeTriar,
} from './corretiva';
import { Conflito, RegraViolada } from './erros';
import { escopoCobreHotel } from './equipes';
import { vigente } from './permissoes';
import type { PrioridadeParaRegra } from './situacoes';
import type { Atribuicao } from './tipos';

/** Quem a triagem escolheu, como a regra precisa enxergá-lo. */
export type CandidatoAResponsavel =
  | { tipo: 'tecnico'; usuarioId: string; atribuicoes: readonly Atribuicao[] }
  | { tipo: 'equipe'; equipeId: string; hotelId: string; ativa: boolean };

/**
 * A OS vai para um Técnico com papel vigente que cubra o hotel, ou para uma
 * equipe ativa do próprio hotel (A6). Devolve o responsável que a OS guarda.
 */
export function exigirResponsavelDoHotel(
  candidato: CandidatoAResponsavel,
  hotel: ChamadoParaRegra['hotel'],
  agora: Date,
): Responsavel {
  if (candidato.tipo === 'tecnico') {
    const tecnico = candidato.atribuicoes.some(
      (a) =>
        a.usuarioId === candidato.usuarioId &&
        a.papel === 'tecnico' &&
        vigente(a, agora) &&
        escopoCobreHotel(a, hotel),
    );
    if (!tecnico) {
      throw new RegraViolada(
        'responsavel_sem_papel_tecnico',
        'A pessoa escolhida não é Técnico ativo neste hotel.',
      );
    }
    return { tipo: 'tecnico', usuarioId: candidato.usuarioId };
  }
  if (candidato.hotelId !== hotel.id || !candidato.ativa) {
    throw new RegraViolada(
      'equipe_indisponivel',
      'A equipe escolhida não é deste hotel ou está desativada.',
    );
  }
  return { tipo: 'equipe', equipeId: candidato.equipeId };
}

/** A triagem escolhe só prioridade ativa do tenant. */
export function exigirPrioridadeAtiva(
  prioridades: readonly PrioridadeParaRegra[],
  prioridadeId: string,
): void {
  if (!prioridades.some((p) => p.id === prioridadeId && p.ativa)) {
    throw new RegraViolada(
      'prioridade_indisponivel',
      'A prioridade escolhida não existe ou está desativada.',
    );
  }
}

/** A prioridade se ajusta até a execução; depois da conclusão, não. */
export const ESTADOS_COM_PRIORIDADE_AJUSTAVEL: readonly EstadoDoChamado[] = [
  'aberto',
  'em_triagem',
  'em_execucao',
];

/** Ajustar a prioridade: papel da triagem no hotel (403) e chamado ainda em curso (409). */
export function podeAjustarPrioridade(
  ator: AtorDaCorretiva,
  chamado: ChamadoParaRegra,
  agora: Date,
): void {
  podeTriar(ator, chamado.hotel, agora);
  if (!ESTADOS_COM_PRIORIDADE_AJUSTAVEL.includes(chamado.estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao: 'priorizar',
      estado: chamado.estado,
    });
  }
}
