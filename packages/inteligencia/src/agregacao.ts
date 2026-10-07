// Agregação mensal dos resultados diários (ADR-036), para a visão de rede. O
// job grava o resultado diário por ativo e, no fechamento do mês, o resumo do
// mês por ativo e por hotel. Nada é apagado; telas e consultas leem a janela de
// leitura da política (ADR-036, revisão de 06/10/2026).
//
// Score sem dado (null) não entra na média nem no máximo: conta só em
// `diasSemDado`, como no score, onde dado ausente não vira zero.

/**
 * Resultado diário de um ativo, como a agregação o lê. Um recálculo de um dia
 * grava outra linha (`calculo` maior), e a agregação fica com a de maior
 * `calculo` de cada dia: o resultado gravado antes continua guardado, só deixa
 * de ser o que a leitura mostra.
 */
export interface MetricaDiaria {
  /** Dia em UTC, `AAAA-MM-DD`. */
  dia: string;
  ativoId: string;
  hotelId: string;
  reincidencia: number | null;
  atencao: number | null;
  /** Faixa da atenção no dia, ou 'dados_insuficientes'. */
  faixaAtencao: string;
  /** 1 é o cálculo do dia; maior que 1, um recálculo. Sem o campo, vale 1. */
  calculo?: number;
}

/**
 * A linha que o job grava por ativo e por dia (ADR-036, condição do Cesar de
 * 07/10/2026): além dos scores, a versão da fórmula de cada score e a da
 * política usadas, e a marca de recálculo. A configuração usada vai no
 * detalhamento do score (`Score.configuracao`).
 */
export interface LinhaDaMetricaDiaria extends MetricaDiaria {
  calculo: number;
  /** O dia foi calculado de novo (ou depois da hora), com a versão de hoje da fórmula e da política. */
  recalculo: boolean;
  versaoFormulaReincidencia: number;
  versaoFormulaAtencao: number;
  /** Identifica as linhas de app.politica usadas (`HotelDoDia.versaoPolitica`); `padrao` sem política gravada. */
  versaoPolitica: string;
}

export interface ResumoDeScore {
  media: number | null;
  maximo: number | null;
  diasComDado: number;
  diasSemDado: number;
}

export interface ResumoMensalDoAtivo {
  /** `AAAA-MM`. */
  mes: string;
  ativoId: string;
  hotelId: string;
  reincidencia: ResumoDeScore;
  atencao: ResumoDeScore;
  /** Dias em cada faixa da atenção, para o gráfico da rede. */
  diasPorFaixa: Readonly<Record<string, number>>;
  /** A faixa do último dia do mês com resultado. */
  faixaFinal: string;
}

export interface ResumoMensalDoHotel {
  mes: string;
  hotelId: string;
  ativos: number;
  /** Média das médias de atenção dos ativos com dado. */
  atencaoMedia: number | null;
  /** Ativos que terminaram o mês em cada faixa. */
  ativosPorFaixaFinal: Readonly<Record<string, number>>;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const umaCasa = (x: number): number => Math.round(x * 10) / 10;

export const mesDoDia = (dia: string): string => {
  if (!DIA.test(dia)) throw new Error(`Dia fora do formato AAAA-MM-DD: ${dia}`);
  return dia.slice(0, 7);
};

function resumir(valores: readonly (number | null)[]): ResumoDeScore {
  const comDado = valores.filter((v): v is number => v !== null);
  return {
    media: comDado.length ? umaCasa(comDado.reduce((s, v) => s + v, 0) / comDado.length) : null,
    maximo: comDado.length ? Math.max(...comDado) : null,
    diasComDado: comDado.length,
    diasSemDado: valores.length - comDado.length,
  };
}

const contar = (chaves: readonly string[]): Record<string, number> => {
  const r: Record<string, number> = {};
  for (const c of chaves) r[c] = (r[c] ?? 0) + 1;
  return r;
};

/** Resumo do mês por ativo. Só entram os dias do `mes` pedido; dia repetido vale o de maior `calculo` (empate, o último da lista). */
export function agregarMesDosAtivos(
  dias: readonly MetricaDiaria[],
  mes: string,
): ResumoMensalDoAtivo[] {
  const porAtivo = new Map<string, Map<string, MetricaDiaria>>();
  for (const d of dias) {
    if (mesDoDia(d.dia) !== mes) continue;
    const doAtivo = porAtivo.get(d.ativoId) ?? new Map<string, MetricaDiaria>();
    const atual = doAtivo.get(d.dia);
    if (!atual || (d.calculo ?? 1) >= (atual.calculo ?? 1)) doAtivo.set(d.dia, d);
    porAtivo.set(d.ativoId, doAtivo);
  }
  return [...porAtivo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ativoId, doAtivo]) => {
      const ordenados = [...doAtivo.values()].sort((a, b) => a.dia.localeCompare(b.dia));
      const ultimo = ordenados[ordenados.length - 1] as MetricaDiaria;
      return {
        mes,
        ativoId,
        hotelId: ultimo.hotelId,
        reincidencia: resumir(ordenados.map((d) => d.reincidencia)),
        atencao: resumir(ordenados.map((d) => d.atencao)),
        diasPorFaixa: contar(ordenados.map((d) => d.faixaAtencao)),
        faixaFinal: ultimo.faixaAtencao,
      };
    });
}

/** Resumo do mês por hotel, a partir dos resumos dos ativos. */
export function agregarMesDosHoteis(ativos: readonly ResumoMensalDoAtivo[]): ResumoMensalDoHotel[] {
  const porHotel = new Map<string, ResumoMensalDoAtivo[]>();
  for (const a of ativos) {
    const chave = `${a.mes}|${a.hotelId}`;
    porHotel.set(chave, [...(porHotel.get(chave) ?? []), a]);
  }
  return [...porHotel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, doHotel]) => {
      const primeiro = doHotel[0] as ResumoMensalDoAtivo;
      const medias = doHotel.map((a) => a.atencao.media);
      return {
        mes: primeiro.mes,
        hotelId: primeiro.hotelId,
        ativos: doHotel.length,
        atencaoMedia: resumir(medias).media,
        ativosPorFaixaFinal: contar(doHotel.map((a) => a.faixaFinal)),
      };
    });
}

/** Janela de leitura da métrica diária (ADR-036, revisão de 06/10/2026): 180 dias, por política. */
export const JANELA_DE_LEITURA_PADRAO_DIAS = 180;

/**
 * Primeiro dia (UTC, `AAAA-MM-DD`) que telas e consultas leem da métrica diária:
 * `dias` dias terminando hoje, contando hoje como o último. Nada é apagado: o
 * resultado gravado de cada dia é a fonte de verdade do histórico.
 */
export function inicioDaJanelaDeLeitura(
  agora: Date,
  dias: number = JANELA_DE_LEITURA_PADRAO_DIAS,
): string {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return new Date(hoje - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
}
/** O mês que o job fecha em `agora`: o anterior ao mês corrente (UTC). */
export function mesAFechar(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}
