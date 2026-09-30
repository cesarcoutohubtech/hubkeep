// Parada do equipamento (fase 1a, C5). Registra de quando a quando o ativo
// ficou parado, ligada ao chamado do ativo e, na execução, à OS. Quem registra
// é regra de corretiva.ts (quem abre o chamado; o responsável pela OS, com
// decidirRegistroNaOs; quem encerra pelo hotel, podeEncerrarParada). Aqui
// ficam o início e o fim aceitos, a parada aberta única por ativo e o tempo
// parado, que o indicador da 1c vai usar. O banco guarda só o formato (fim
// depois do início) e a parada aberta única (índice único parcial).
import { Conflito, RegraViolada } from './erros';
import { FOLGA_DO_RELOGIO_MINUTOS } from './execucao';

export interface Parada {
  inicio: Date;
  /** null: o ativo ainda está parado. */
  fim: Date | null;
}

const invalida = () =>
  new RegraViolada('parada_invalida', 'Início ou fim da parada inválido.', {
    folgaMinutos: FOLGA_DO_RELOGIO_MINUTOS,
  });

const noFuturo = (d: Date, agora: Date) =>
  d.getTime() - agora.getTime() > FOLGA_DO_RELOGIO_MINUTOS * 60_000;

/**
 * Início e fim da parada: data válida, nada no futuro (com a folga do relógio
 * do aparelho, porque a operação chega depois, na sincronização) e o fim, se
 * houver, depois do início.
 */
export function validarParada(p: Parada, agora: Date): Parada {
  if (Number.isNaN(p.inicio.getTime()) || noFuturo(p.inicio, agora)) throw invalida();
  if (p.fim !== null) validarFimDaParada(p.inicio, p.fim, agora);
  return p;
}

/** Fim de uma parada aberta: depois do início e não no futuro. */
export function validarFimDaParada(inicio: Date, fim: Date, agora: Date): Date {
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= inicio.getTime() || noFuturo(fim, agora)) {
    throw invalida();
  }
  return fim;
}

/** Parada só em chamado com ativo: é o ativo que fica parado. */
export function exigirAtivoNoChamado(ativoId: string | null): string {
  if (ativoId === null) {
    throw new RegraViolada('parada_sem_ativo', 'O chamado não tem ativo.');
  }
  return ativoId;
}

/** Uma parada aberta por ativo; registrar outra (aberta ou já encerrada) espera a atual fechar. */
export function exigirSemParadaAberta(aberta: Parada | null): void {
  if (aberta !== null) {
    throw new Conflito('parada_ja_aberta', 'O ativo já tem uma parada aberta.', {
      inicio: aberta.inicio.toISOString(),
    });
  }
}

export function exigirParadaAberta<T extends Parada>(parada: T | null): T {
  if (parada === null || parada.fim !== null) {
    throw new Conflito('parada_nao_aberta', 'O ativo não tem parada aberta.');
  }
  return parada;
}

/**
 * Na conclusão da OS com a parada do próprio chamado aberta, o técnico
 * responde se o equipamento voltou a funcionar (decisão do Cesar de
 * 30/09/2026). Sim: a parada encerra com a hora da conclusão, na mesma
 * operação. Não, ou sem resposta (operação feita antes da pergunta existir, ou
 * sem o aparelho saber da parada): fica aberta, e aparece na lista das
 * paradas abertas com OS concluída. A parada de outro chamado do mesmo ativo
 * não é desta OS e nunca encerra aqui. Devolve a parada a encerrar, ou null.
 */
export function paradaAEncerrarNaConclusao<T extends Parada & { chamadoId: string }>(
  aberta: T | null,
  chamadoId: string,
  equipamentoVoltou: boolean | undefined,
): T | null {
  if (aberta === null || aberta.fim !== null || aberta.chamadoId !== chamadoId) return null;
  return equipamentoVoltou === true ? aberta : null;
}

/** Tempo parado, em milissegundos: do início ao fim, ou até agora se ainda aberta. */
export const tempoParado = (p: Parada, agora: Date): number =>
  Math.max(0, (p.fim ?? agora).getTime() - p.inicio.getTime());

/**
 * Tempo parado de várias paradas do mesmo ativo, em milissegundos, sem contar
 * duas vezes o trecho em que duas se sobrepõem (uma registrada depois, na
 * execução, pode cobrir parte de outra).
 */
export function tempoParadoTotal(paradas: readonly Parada[], agora: Date): number {
  const trechos = paradas
    .map((p) => [p.inicio.getTime(), (p.fim ?? agora).getTime()] as const)
    .filter(([i, f]) => f > i)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let aberto: [number, number] | null = null;
  for (const [i, f] of trechos) {
    if (aberto && i <= aberto[1]) {
      aberto[1] = Math.max(aberto[1], f);
    } else {
      if (aberto) total += aberto[1] - aberto[0];
      aberto = [i, f];
    }
  }
  return aberto ? total + aberto[1] - aberto[0] : total;
}
