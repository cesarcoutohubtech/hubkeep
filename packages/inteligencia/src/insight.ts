// Ciclo de vida do insight (ADR-033). Os estados canônicos são fixos aqui, como
// os do chamado e da OS (ADR-027); o banco guarda só o formato, com teste de
// paridade. O score sugere e a pessoa decide: o job só abre ou atualiza o
// insight (decidirDeteccao), e toda transição é de uma pessoa (decidirNoInsight).
//
// Quem decide, as transições, o silêncio depois do descarte e o resolvido que
// volta foram aprovados por escrito em 05/10/2026 (PR #98): o Admin do grupo, o
// Gestor CSC e o Gerente do hotel, cada um no próprio escopo. O insight de rede
// (sem hotel) só por quem tem escopo de grupo, ou da bandeira dele.
import {
  Conflito,
  PermissaoNegada,
  escopoCobreHotel,
  normalizarMotivo,
  vigente,
  type Atribuicao,
  type Papel,
} from '@hubkeep/dominio';
import { DIA_MS, FAIXAS_PADRAO, type Faixa } from './score';

export const ESTADOS_DO_INSIGHT = [
  'novo',
  'em_revisao',
  'aceito',
  'em_acao',
  'monitorando',
  'resolvido',
  'descartado',
] as const;
export type EstadoDoInsight = (typeof ESTADOS_DO_INSIGHT)[number];

/** Estados em que o job atualiza o insight em vez de abrir outro. */
export const ESTADOS_ABERTOS_DO_INSIGHT: readonly EstadoDoInsight[] = [
  'novo',
  'em_revisao',
  'aceito',
  'em_acao',
  'monitorando',
];

export const ehEstadoDoInsight = (e: unknown): e is EstadoDoInsight =>
  typeof e === 'string' && (ESTADOS_DO_INSIGHT as readonly string[]).includes(e);

export const ACOES_DO_INSIGHT = [
  'revisar',
  'aceitar',
  'agir',
  'monitorar',
  'resolver',
  'descartar',
] as const;
export type AcaoDoInsight = (typeof ACOES_DO_INSIGHT)[number];

interface TransicaoDoInsight {
  de: readonly EstadoDoInsight[];
  para: EstadoDoInsight;
  /** Resolver e descartar pedem nota, de 1 a 500 caracteres (LIMITE_MOTIVO do domínio). */
  exigeNota: boolean;
}

/**
 * - revisar: alguém assumiu a análise;
 * - aceitar: o problema é real (PRD, seção 35, item 7);
 * - agir: abriu investigação, chamado ou OS (a ligação é da aplicação);
 * - monitorar: a ação terminou e a efetividade (antes e depois) está em observação;
 * - resolver e descartar: encerram, com nota.
 */
export const TRANSICOES_DO_INSIGHT: { [A in AcaoDoInsight]: TransicaoDoInsight } = {
  revisar: { de: ['novo'], para: 'em_revisao', exigeNota: false },
  aceitar: { de: ['novo', 'em_revisao'], para: 'aceito', exigeNota: false },
  agir: { de: ['aceito'], para: 'em_acao', exigeNota: false },
  monitorar: { de: ['em_acao'], para: 'monitorando', exigeNota: false },
  resolver: { de: ['aceito', 'em_acao', 'monitorando'], para: 'resolvido', exigeNota: true },
  descartar: { de: ['novo', 'em_revisao', 'aceito'], para: 'descartado', exigeNota: true },
};

/** Papéis que decidem o insight, no escopo de cada um (aprovado em 05/10/2026). */
export const PAPEIS_DO_INSIGHT: readonly Papel[] = ['admin_grupo', 'gestor_csc', 'gerente_hotel'];

/** Onde o insight vale: um hotel, ou a rede (do grupo, ou de uma bandeira). */
export type AlcanceDoInsight =
  | { tipo: 'hotel'; hotelId: string; bandeiraId: string | null }
  | { tipo: 'rede'; bandeiraId: string | null };

function cobre(a: Atribuicao, alcance: AlcanceDoInsight): boolean {
  if (alcance.tipo === 'hotel') {
    return escopoCobreHotel(a, { id: alcance.hotelId, bandeiraId: alcance.bandeiraId });
  }
  if (a.papel === 'gerente_hotel') return false;
  if (a.escopo.tipo === 'grupo') return true;
  return (
    a.escopo.tipo === 'bandeira' &&
    alcance.bandeiraId !== null &&
    a.escopo.bandeiraId === alcance.bandeiraId
  );
}

export function podeDecidirInsight(
  minhas: readonly Atribuicao[],
  alcance: AlcanceDoInsight,
  agora: Date,
): boolean {
  return minhas.some(
    (a) => vigente(a, agora) && PAPEIS_DO_INSIGHT.includes(a.papel) && cobre(a, alcance),
  );
}

/**
 * Ação de uma pessoa sobre o insight. Confere o papel no alcance (403), o
 * estado (409, transicao_invalida) e a nota (422). Devolve o estado novo e a
 * nota normalizada, quando a ação exige.
 */
export function decidirNoInsight(
  acao: AcaoDoInsight,
  p: {
    atribuicoes: readonly Atribuicao[];
    insight: { estado: EstadoDoInsight; alcance: AlcanceDoInsight };
    nota?: string | null | undefined;
    agora: Date;
  },
): { estado: EstadoDoInsight; nota: string | null } {
  if (!podeDecidirInsight(p.atribuicoes, p.insight.alcance, p.agora)) {
    throw new PermissaoNegada('insight_fora_do_escopo', 'Você não decide insights neste escopo.', {
      acao,
    });
  }
  const t = TRANSICOES_DO_INSIGHT[acao];
  if (!t.de.includes(p.insight.estado)) {
    throw new Conflito('transicao_invalida', 'A ação não vale no estado atual.', {
      acao,
      estado: p.insight.estado,
    });
  }
  return { estado: t.para, nota: t.exigeNota ? normalizarMotivo(p.nota) : null };
}

/**
 * Chave que identifica "o mesmo escopo e a mesma regra" (ADR-033): o tipo e os
 * pares do escopo em ordem, para o job achar o insight já aberto.
 */
export function chaveDoInsight(tipo: string, escopo: Readonly<Record<string, string>>): string {
  const pares = Object.keys(escopo)
    .sort()
    .map((k) => `${k}=${escopo[k]}`);
  return [tipo, ...pares].join('|');
}

export interface InsightExistente {
  id: string;
  chave: string;
  estado: EstadoDoInsight;
  /** Faixa do score na última detecção ou no encerramento. */
  faixa: string;
  /** Quando foi resolvido ou descartado; null se aberto. */
  encerradoEm: Date | null;
}

export interface Deteccao {
  chave: string;
  faixa: string;
}

export interface ConfigDeteccao {
  /**
   * Aprovado em 05/10/2026: depois do descarte, o job não reabre a mesma chave por estes
   * dias, a menos que a faixa suba. Resolvido não silencia: o problema que
   * volta depois de resolvido abre insight novo, ligado ao anterior.
   */
  silencioAposDescarteDias: number;
  faixas: readonly Faixa[];
}

export const PADRAO_DETECCAO: ConfigDeteccao = {
  silencioAposDescarteDias: 30,
  faixas: FAIXAS_PADRAO,
};

export type DecisaoDoJob =
  | { acao: 'abrir'; anteriorId: string | null }
  | { acao: 'atualizar'; insightId: string; subiuDeFaixa: boolean }
  | { acao: 'ignorar'; motivo: 'descartado_recente'; insightId: string };

const ordemDaFaixa = (faixa: string, faixas: readonly Faixa[]): number =>
  [...faixas].sort((a, b) => a.desde - b.desde).findIndex((f) => f.chave === faixa);

/**
 * O que o job faz com uma detecção. Nunca muda o estado de um insight aberto:
 * só atualiza a última detecção, o score e a faixa. Sem insight aberto da
 * mesma chave, abre um, salvo o descarte recente sem subida de faixa.
 */
export function decidirDeteccao(
  existentes: readonly InsightExistente[],
  deteccao: Deteccao,
  agora: Date,
  config: ConfigDeteccao = PADRAO_DETECCAO,
): DecisaoDoJob {
  const daChave = existentes.filter((i) => i.chave === deteccao.chave);
  const subiu = (de: string) =>
    ordemDaFaixa(deteccao.faixa, config.faixas) > ordemDaFaixa(de, config.faixas);

  const aberto = daChave.find((i) => ESTADOS_ABERTOS_DO_INSIGHT.includes(i.estado));
  if (aberto) return { acao: 'atualizar', insightId: aberto.id, subiuDeFaixa: subiu(aberto.faixa) };

  const ultimo = daChave
    .flatMap((i) => (i.encerradoEm === null ? [] : [{ ...i, em: i.encerradoEm.getTime() }]))
    .sort((a, b) => b.em - a.em)[0];
  if (
    ultimo?.estado === 'descartado' &&
    agora.getTime() - ultimo.em < config.silencioAposDescarteDias * DIA_MS &&
    !subiu(ultimo.faixa)
  ) {
    return { acao: 'ignorar', motivo: 'descartado_recente', insightId: ultimo.id };
  }
  return { acao: 'abrir', anteriorId: ultimo?.id ?? null };
}
