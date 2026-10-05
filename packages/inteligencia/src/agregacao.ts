// Agregação mensal dos resultados diários (ADR-036), para a visão de rede. O
// job grava o resultado diário por ativo e, no fechamento do mês, o resumo do
// mês por ativo e por hotel. Os dias guardam 12 meses; o corte é calculado aqui
// (limiteDeRetencao), e a forma de tirar o que passou fica para o PR das
// tabelas, sem DELETE para nenhum papel da aplicação.
//
// Score sem dado (null) não entra na média nem no máximo: conta só em
// `diasSemDado`, como no score, onde dado ausente não vira zero.

/** Resultado diário de um ativo, como o job grava (os nomes da tabela vêm no PR dela). */
export interface MetricaDiaria {
  /** Dia em UTC, `AAAA-MM-DD`. */
  dia: string;
  ativoId: string;
  hotelId: string;
  reincidencia: number | null;
  atencao: number | null;
  /** Faixa da atenção no dia, ou 'dados_insuficientes'. */
  faixaAtencao: string;
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

/** Resumo do mês por ativo. Só entram os dias do `mes` pedido; dia repetido vale o último da lista. */
export function agregarMesDosAtivos(
  dias: readonly MetricaDiaria[],
  mes: string,
): ResumoMensalDoAtivo[] {
  const porAtivo = new Map<string, Map<string, MetricaDiaria>>();
  for (const d of dias) {
    if (mesDoDia(d.dia) !== mes) continue;
    const doAtivo = porAtivo.get(d.ativoId) ?? new Map<string, MetricaDiaria>();
    doAtivo.set(d.dia, d);
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

/**
 * Primeiro dia que ainda se guarda: o mesmo dia, `meses` meses antes de
 * `agora` (UTC). No dia 31 de um mês, o mês curto cai no último dia dele.
 */
export function limiteDeRetencao(agora: Date, meses = 12): string {
  const ano = agora.getUTCFullYear();
  const mes = agora.getUTCMonth() - meses;
  const ultimoDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(ano, mes, Math.min(agora.getUTCDate(), ultimoDoMes)));
  return d.toISOString().slice(0, 10);
}

/** O mês que o job fecha em `agora`: o anterior ao mês corrente (UTC). */
export function mesAFechar(agora: Date): string {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7);
}
