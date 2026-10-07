// Ciclo de vida do insight (ADR-033). Os estados canônicos são fixos aqui, como
// os do chamado e da OS (ADR-027); o banco guarda só o formato, com teste de
// paridade. O score sugere e a pessoa decide: o job só abre ou atualiza o
// insight (decidirDeteccao), e toda transição é de uma pessoa (decidirNoInsight).
//
// Quem decide, as transições, o silêncio depois do descarte e o resolvido que
// volta foram aprovados por escrito em 05/10/2026 (PR #98): o Admin do grupo, o
// Gestor CSC e o Gerente do hotel, cada um no próprio escopo. O insight de rede
// (sem hotel) só por quem tem escopo de grupo, ou da bandeira dele.
//
// Hotel novo num insight de rede (Kaio em 06/10/2026, Cesar em 07/10/2026, com a
// condição do hash): o job abre um insight novo, ligado ao anterior, e o
// anterior fica aberto até uma pessoa decidir. O job nunca muda estado, e a
// lista de hotéis do insight não muda. Aqui nada é hash: a decisão compara
// conjuntos de hotéis, e a chave de unicidade (família mais o SHA-256 da lista
// canônica) é calculada por quem grava, no job (node:crypto) ou no banco
// (sha256()).
import {
  Conflito,
  PermissaoNegada,
  RegraViolada,
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

/** Por que uma pessoa descartou: só o "não relevante" silencia a família (aprovado por Kaio em 06/10/2026). */
export const MOTIVOS_DE_DESCARTE = ['nao_relevante', 'substituido'] as const;
export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number];

export const ehMotivoDeDescarte = (m: unknown): m is MotivoDeDescarte =>
  typeof m === 'string' && (MOTIVOS_DE_DESCARTE as readonly string[]).includes(m);

/**
 * Ação de uma pessoa sobre o insight. Confere o papel no alcance (403), o
 * estado (409, transicao_invalida), o motivo do descarte (422) e a nota (422).
 * Devolve o estado novo, a nota normalizada, quando a ação exige, e o motivo
 * do descarte, só no descartar.
 */
export function decidirNoInsight(
  acao: AcaoDoInsight,
  p: {
    atribuicoes: readonly Atribuicao[];
    insight: { estado: EstadoDoInsight; alcance: AlcanceDoInsight };
    nota?: string | null | undefined;
    motivoDeDescarte?: string | null | undefined;
    agora: Date;
  },
): { estado: EstadoDoInsight; nota: string | null; motivoDeDescarte: MotivoDeDescarte | null } {
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
  let motivoDeDescarte: MotivoDeDescarte | null = null;
  if (acao === 'descartar') {
    if (!ehMotivoDeDescarte(p.motivoDeDescarte)) {
      throw new RegraViolada('motivo_de_descarte_invalido', 'Motivo do descarte inválido.', {
        validos: MOTIVOS_DE_DESCARTE.join(','),
      });
    }
    motivoDeDescarte = p.motivoDeDescarte;
  }
  return { estado: t.para, nota: t.exigeNota ? normalizarMotivo(p.nota) : null, motivoDeDescarte };
}

/**
 * Família do insight: o tipo e os pares do escopo em ordem, sem a lista de
 * hotéis (ADR-033). Identifica "o mesmo problema, no mesmo escopo e na mesma
 * regra", para o job achar os insights já abertos.
 */
export function familiaDoInsight(tipo: string, escopo: Readonly<Record<string, string>>): string {
  const pares = Object.keys(escopo)
    .sort()
    .map((k) => `${k}=${escopo[k]}`);
  return [tipo, ...pares].join('|');
}

/**
 * Lista canônica dos hotéis de um insight: sem repetição, em ordem crescente
 * do texto do UUID (minúsculo). É tudo o que esta função pura entrega para a
 * chave de unicidade: quem grava calcula o SHA-256 de `lista.join(',')`, em
 * UTF-8 e hexadecimal minúsculo, com node:crypto no job ou sha256() no banco, e
 * monta `chave = familia + '|hoteis=' + hash`. O hash existe porque o btree não
 * aceita entrada acima de cerca de 2,7 KB, e a lista estoura com uns 70 hotéis;
 * `hotel_ids` guarda a lista completa.
 */
export const SEPARADOR_DE_HOTEIS = ',';
export function listaCanonicaDeHoteis(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

export interface InsightExistente {
  id: string;
  /** O mesmo problema, sem a lista de hotéis (`familiaDoInsight`). */
  familia: string;
  /** Todos os hotéis do insight, na lista canônica. */
  hotelIds: readonly string[];
  estado: EstadoDoInsight;
  /** Faixa do score na última detecção ou no encerramento. */
  faixa: string;
  /** Primeira detecção: o mais recente da família é o que o novo substitui. */
  abertoEm: Date;
  /** O insight que este substituiu ou de que é recorrência; null se nasceu sozinho. */
  anteriorId: string | null;
  /** Quando foi resolvido ou descartado; null se aberto. */
  encerradoEm: Date | null;
  /** Só no descartado. */
  motivoDeDescarte: MotivoDeDescarte | null;
}

export interface Deteccao {
  familia: string;
  /** Todos os hotéis da detecção, na lista canônica. */
  hotelIds: readonly string[];
  faixa: string;
}

export interface ConfigDeteccao {
  /**
   * Aprovado em 05/10/2026: depois do descarte "não relevante", o job não
   * reabre a mesma família por estes dias, a menos que a faixa suba (Kaio, em
   * 06/10/2026: pela família, e só nesse motivo). Resolvido e descarte
   * "substituído" não silenciam: o problema que volta abre insight novo,
   * ligado ao anterior.
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
  | {
      acao: 'ignorar';
      motivo: 'descartado_recente' | 'conjunto_contido';
      insightId: string;
    };

const ordemDaFaixa = (faixa: string, faixas: readonly Faixa[]): number =>
  [...faixas].sort((a, b) => a.desde - b.desde).findIndex((f) => f.chave === faixa);

const mesmoConjunto = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));
const contido = (a: readonly string[], b: readonly string[]): boolean =>
  a.every((id) => b.includes(id));

/**
 * O que o job faz com uma detecção, pela família (Kaio, 06/10/2026). Nunca
 * muda o estado de um insight. Com insight aberto da família:
 * - o mesmo conjunto de hotéis: atualiza a última detecção, o score e a faixa;
 * - um conjunto contido no de um aberto (saiu hotel, ou nada mudou): nada a
 *   fazer;
 * - hotel a mais: abre um insight novo, ligado ao aberto mais recente. O
 *   anterior fica aberto até uma pessoa decidir.
 * Sem aberto na família, abre, ligado ao último encerrado, salvo o descarte
 * "não relevante" recente sem subida de faixa.
 */
export function decidirDeteccao(
  existentes: readonly InsightExistente[],
  deteccao: Deteccao,
  agora: Date,
  config: ConfigDeteccao = PADRAO_DETECCAO,
): DecisaoDoJob {
  const daFamilia = existentes.filter((i) => i.familia === deteccao.familia);
  const subiu = (de: string) =>
    ordemDaFaixa(deteccao.faixa, config.faixas) > ordemDaFaixa(de, config.faixas);

  const abertos = daFamilia
    .filter((i) => ESTADOS_ABERTOS_DO_INSIGHT.includes(i.estado))
    .sort((a, b) => b.abertoEm.getTime() - a.abertoEm.getTime());
  if (abertos.length) {
    const igual = abertos.find((i) => mesmoConjunto(i.hotelIds, deteccao.hotelIds));
    if (igual) return { acao: 'atualizar', insightId: igual.id, subiuDeFaixa: subiu(igual.faixa) };
    const maior = abertos.find((i) => contido(deteccao.hotelIds, i.hotelIds));
    if (maior) return { acao: 'ignorar', motivo: 'conjunto_contido', insightId: maior.id };
    return { acao: 'abrir', anteriorId: (abertos[0] as InsightExistente).id };
  }

  const ultimo = daFamilia
    .flatMap((i) => (i.encerradoEm === null ? [] : [{ ...i, em: i.encerradoEm.getTime() }]))
    .sort((a, b) => b.em - a.em)[0];
  if (
    ultimo?.estado === 'descartado' &&
    ultimo.motivoDeDescarte === 'nao_relevante' &&
    agora.getTime() - ultimo.em < config.silencioAposDescarteDias * DIA_MS &&
    !subiu(ultimo.faixa)
  ) {
    return { acao: 'ignorar', motivo: 'descartado_recente', insightId: ultimo.id };
  }
  return { acao: 'abrir', anteriorId: ultimo?.id ?? null };
}

/**
 * "Substituído pelo insight X", calculado pelo vínculo (Kaio, 06/10/2026): o
 * insight mais recente ligado a este que abriu enquanto este ainda estava
 * aberto. O que abriu depois do encerramento é recorrência, não substituição.
 */
export function substituidoPor(
  insight: Pick<InsightExistente, 'id' | 'encerradoEm'>,
  existentes: readonly Pick<InsightExistente, 'id' | 'anteriorId' | 'abertoEm'>[],
): string | null {
  const novos = existentes
    .filter(
      (x) =>
        x.anteriorId === insight.id &&
        (insight.encerradoEm === null || x.abertoEm.getTime() < insight.encerradoEm.getTime()),
    )
    .sort((a, b) => b.abertoEm.getTime() - a.abertoEm.getTime());
  return novos[0]?.id ?? null;
}
