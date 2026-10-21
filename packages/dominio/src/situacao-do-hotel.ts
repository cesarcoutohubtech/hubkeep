// A situação por hotel da tela inicial (1c, seção 4 da paridade), pelo
// glossário único de métricas, versão 4 (Cesar e Kaio, 20/10/2026): o chamado
// crítico, a situação do hotel e as contagens do quadro. Usa os termos que já
// existem: o prazo em risco e o prazo vencido (avisosEmAberto, ADR-043) e a
// preventiva atrasada. Quem vê é a gestão, como nos avisos de SLA.
import type { EstadoDaOs } from './corretiva';
import { PermissaoNegada } from './erros';
import { type AvisoDeSla, PAPEIS_QUE_VEEM_OS_AVISOS } from './monitor-sla';
import { type Resultado, vigente } from './permissoes';
import { diaNoFuso } from './plano-preventivo';
import { preventivaAtrasada } from './preventiva-atrasada';
import type { Atribuicao } from './tipos';

/**
 * Os números da regra da situação, como os do mock. Ficam no domínio até um
 * cliente pedir outros; aí viram política (glossário, versão 4).
 */
export const LIMITES_DA_SITUACAO = {
  /** A partir de quantos chamados com prazo vencido o hotel fica crítico. */
  vencidosParaCritico: 3,
  /** A partir de quantas preventivas atrasadas o hotel fica em atenção. */
  preventivasParaAtencao: 2,
} as const;

/** Da mais grave para a mais leve: a ordem do quadro. */
export const SITUACOES_DO_HOTEL = ['critico', 'atencao', 'ok'] as const;
export type SituacaoDoHotel = (typeof SITUACOES_DO_HOTEL)[number];

/** Os dias da coluna dos chamados abertos por dia. */
export const DIAS_DOS_ABERTOS_DO_QUADRO = 14;

/**
 * As prioridades do chamado crítico: as ativas de maior peso. Vale o peso, e
 * não o nome, para que a prioridade própria de um grupo também conte; com
 * empate no maior peso, todas as empatadas contam.
 */
export function prioridadesCriticas(
  prioridades: readonly { id: string; peso: number; ativa: boolean }[],
): ReadonlySet<string> {
  const ativas = prioridades.filter((p) => p.ativa);
  if (ativas.length === 0) return new Set();
  const maior = Math.max(...ativas.map((p) => p.peso));
  return new Set(ativas.filter((p) => p.peso === maior).map((p) => p.id));
}

/** As contagens do quadro de um hotel, cada chamado uma vez. */
export interface ContagemDoHotel {
  /** Com algum prazo em risco e nenhum vencido. */
  vencemEmBreve: number;
  /** Com algum prazo vencido. */
  foraDoPrazo: number;
  /** Os chamados críticos em curso. */
  criticos: number;
  /** Os críticos com algum prazo vencido. */
  criticosVencidos: number;
  preventivasAtrasadas: number;
}

/** As contagens dos chamados em curso do hotel, com os avisos em aberto de cada um. */
export function contarChamadosDoHotel(
  chamados: readonly { prioridadeId: string | null; avisos: readonly AvisoDeSla[] }[],
  criticas: ReadonlySet<string>,
): Omit<ContagemDoHotel, 'preventivasAtrasadas'> {
  const c = { vencemEmBreve: 0, foraDoPrazo: 0, criticos: 0, criticosVencidos: 0 };
  for (const ch of chamados) {
    const vencido = ch.avisos.some((a) => a.nivel === 'vencido');
    const critico = ch.prioridadeId !== null && criticas.has(ch.prioridadeId);
    if (vencido) c.foraDoPrazo += 1;
    else if (ch.avisos.some((a) => a.nivel === 'em_risco')) c.vencemEmBreve += 1;
    if (critico) c.criticos += 1;
    if (critico && vencido) c.criticosVencidos += 1;
  }
  return c;
}

/**
 * A situação do hotel: crítico, com algum chamado crítico de prazo vencido ou
 * 3 ou mais chamados de prazo vencido; atenção, com algum prazo vencido ou em
 * risco, ou 2 ou mais preventivas atrasadas; ok nos demais casos.
 */
export function situacaoDoHotel(c: ContagemDoHotel): SituacaoDoHotel {
  if (c.criticosVencidos > 0 || c.foraDoPrazo >= LIMITES_DA_SITUACAO.vencidosParaCritico) {
    return 'critico';
  }
  if (
    c.foraDoPrazo > 0 ||
    c.vencemEmBreve > 0 ||
    c.preventivasAtrasadas >= LIMITES_DA_SITUACAO.preventivasParaAtencao
  ) {
    return 'atencao';
  }
  return 'ok';
}

/** As preventivas do hotel atrasadas em `agora`, pelo estado de agora de cada OS. */
export function contarPreventivasAtrasadas(
  preventivas: readonly { dataPrevista: string; estado: EstadoDaOs }[],
  o: { fuso: string; agora: Date; toleranciaDias: number },
): number {
  return preventivas.filter((p) =>
    preventivaAtrasada(
      { dataPrevista: p.dataPrevista, transicoes: [{ para: p.estado, quando: o.agora }] },
      o,
    ),
  ).length;
}

/** Os dias da coluna dos abertos por dia, até hoje inclusive, no fuso do hotel. */
export function diasDosAbertosDoQuadro(agora: Date, fuso: string): string[] {
  const hoje = diaNoFuso(agora, fuso);
  const base = Date.parse(`${hoje}T00:00:00Z`);
  return Array.from({ length: DIAS_DOS_ABERTOS_DO_QUADRO }, (_, i) =>
    new Date(base - (DIAS_DOS_ABERTOS_DO_QUADRO - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Os chamados abertos em cada dia, pela abertura no fuso do hotel. */
export function abertosPorDia(
  aberturas: readonly Date[],
  dias: readonly string[],
  fuso: string,
): number[] {
  const porDia = new Map<string, number>(dias.map((d) => [d, 0]));
  for (const a of aberturas) {
    const dia = diaNoFuso(a, fuso);
    const n = porDia.get(dia);
    if (n !== undefined) porDia.set(dia, n + 1);
  }
  return dias.map((d) => porDia.get(d) ?? 0);
}

/** Quem abre o quadro: a gestão, como nos avisos de SLA e nos próximos prazos. */
export function podeVerASituacaoPorHotel(minhas: readonly Atribuicao[], agora: Date): Resultado {
  return minhas.some((a) => vigente(a, agora) && PAPEIS_QUE_VEEM_OS_AVISOS.includes(a.papel))
    ? { permitido: true }
    : {
        permitido: false,
        erro: new PermissaoNegada(
          'situacao_por_hotel_sem_permissao',
          'Só o Admin do grupo, o Gestor CSC e o Gerente do hotel veem a situação por hotel.',
        ),
      };
}
