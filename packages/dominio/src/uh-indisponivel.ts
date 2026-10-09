// UH indisponível por causa de um chamado (fase 1b, I4; desenho aprovado em
// 08/10/2026, docs/referencia/propostas-desenho-1b.md, item 3). O mesmo modelo
// da parada do ativo (paradas.ts): de quando a quando a UH ficou fora de uso.
// Nasce na abertura ("a UH ficou indisponível?", no web e no PWA) ou depois,
// pela gestão do hotel. Termina quando quem conclui a OS marca "UH liberada"
// ou quando a gestão libera, a qualquer momento: a conclusão da OS não fecha
// o período sozinha. O cancelamento do chamado encerra o período, que fica
// fora dos UH-dias perdidos. Quem pode cada ação é de corretiva.ts
// (podeGerirUhIndisponivel e a conclusão da OS). O banco guarda só o formato
// (fim depois do início), o local do próprio chamado e um período aberto por
// chamado (índice único parcial, migração 0034).
import type { EstadoDoChamado } from './corretiva';
import { Conflito, RegraViolada } from './erros';
import { FOLGA_DO_RELOGIO_MINUTOS } from './execucao';
import type { TipoDeLocal } from './licenca';
import { type Parada, tempoParadoTotal } from './paradas';

export interface PeriodoDeUh {
  inicio: Date;
  /** null: a UH ainda está indisponível. */
  fim: Date | null;
}

const invalido = () =>
  new RegraViolada(
    'uh_indisponivel_periodo_invalido',
    'Início ou fim da indisponibilidade inválido.',
    {
      folgaMinutos: FOLGA_DO_RELOGIO_MINUTOS,
    },
  );

const noFuturo = (d: Date, agora: Date) =>
  d.getTime() - agora.getTime() > FOLGA_DO_RELOGIO_MINUTOS * 60_000;

/** Só a UH fica indisponível: o chamado de área comum não tem período. */
export function exigirUhParaIndisponibilidade(local: { tipo: TipoDeLocal }): void {
  if (local.tipo !== 'uh') {
    throw new RegraViolada(
      'uh_indisponivel_fora_de_uh',
      'Só o chamado de uma UH marca a UH como indisponível.',
    );
  }
}

/**
 * Início do período: data válida e nada no futuro, com a folga do relógio do
 * aparelho (a abertura offline chega depois, na sincronização).
 */
export function validarInicioDaIndisponibilidade(inicio: Date, agora: Date): Date {
  if (Number.isNaN(inicio.getTime()) || noFuturo(inicio, agora)) throw invalido();
  return inicio;
}

/** Fim do período aberto: depois do início e não no futuro. */
export function validarFimDaIndisponibilidade(inicio: Date, fim: Date, agora: Date): Date {
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= inicio.getTime() || noFuturo(fim, agora)) {
    throw invalido();
  }
  return fim;
}

/** Marcar a UH depois da abertura só com o chamado em curso, até o aceite. */
export const ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL: readonly EstadoDoChamado[] = [
  'aberto',
  'em_triagem',
  'em_execucao',
  'aguardando_aceite',
];

export function exigirChamadoQueAceitaUhIndisponivel(estado: EstadoDoChamado): void {
  if (!ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL.includes(estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao: 'marcar_uh_indisponivel',
      estado,
    });
  }
}

/** Um período aberto por chamado; marcar de novo espera o atual ser liberado. */
export function exigirSemPeriodoAberto(aberto: PeriodoDeUh | null): void {
  if (aberto !== null) {
    throw new Conflito('uh_indisponivel_ja_aberta', 'A UH já está indisponível por este chamado.', {
      inicio: aberto.inicio.toISOString(),
    });
  }
}

export function exigirPeriodoAberto<T extends PeriodoDeUh>(periodo: T | null): T {
  if (periodo === null || periodo.fim !== null) {
    throw new Conflito(
      'uh_indisponivel_nao_aberta',
      'A UH não está indisponível por este chamado.',
    );
  }
  return periodo;
}

/**
 * Na conclusão da OS, com a UH do chamado indisponível, quem conclui responde
 * se a UH foi liberada. Sim: o período encerra com a hora da conclusão, na
 * mesma operação. Não, ou sem resposta (operação feita antes da pergunta
 * existir): fica aberto, e a gestão libera depois. Devolve o período a
 * encerrar, ou null.
 */
export function periodoALiberarNaConclusao<T extends PeriodoDeUh>(
  aberto: T | null,
  uhLiberada: boolean | undefined,
): T | null {
  if (aberto === null || aberto.fim !== null) return null;
  return uhLiberada === true ? aberto : null;
}

/** Um período como o cálculo dos UH-dias precisa enxergá-lo. */
export interface PeriodoDeUhIndisponivel extends PeriodoDeUh {
  chamadoId: string;
  hotelId: string;
  localId: string;
  /** O ativo do chamado, se houver: a UH pode ficar indisponível sem ativo definido. */
  ativoId?: string | null;
  /** O chamado foi cancelado: o período não conta (decisão do Cesar de 08/10/2026). */
  chamadoCancelado?: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * UH-dias perdidos no intervalo [de, ate): a soma, por UH, do tempo
 * indisponível dentro do intervalo, dividido por 24 horas, com uma casa
 * decimal. Períodos que se sobrepõem na mesma UH contam uma vez (dois
 * chamados no mesmo quarto no mesmo dia não perdem dois dias), o período
 * aberto conta até `agora`, e o de chamado cancelado fica de fora. Quem chama
 * filtra os períodos pelo escopo que quer medir (um ativo, um hotel, a rede).
 * Indicador da 1c e medida do Intelligence (a função saiu do módulo para o
 * núcleo, que nunca importa o módulo).
 */
export function uhDiasPerdidos(
  periodos: readonly PeriodoDeUhIndisponivel[],
  de: Date,
  ate: Date,
  agora: Date,
): number {
  const porUh = new Map<string, Parada[]>();
  for (const p of periodos) {
    if (p.chamadoCancelado === true) continue;
    const inicio = Math.max(p.inicio.getTime(), de.getTime());
    const fim = Math.min((p.fim ?? agora).getTime(), ate.getTime());
    if (fim <= inicio) continue;
    const chave = `${p.hotelId}|${p.localId}`;
    porUh.set(chave, [
      ...(porUh.get(chave) ?? []),
      { inicio: new Date(inicio), fim: new Date(fim) },
    ]);
  }
  let ms = 0;
  for (const trechos of porUh.values()) ms += tempoParadoTotal(trechos, agora);
  return Math.round((ms / DIA_MS) * 10) / 10;
}
