// Efetividade da intervenção (PRD, seção 16): o problema diminuiu depois que
// corrigimos? Compara a mesma janela antes e depois da data da intervenção.
// O resultado fala só em variação observada, nunca em causa (PRD, princípio 7):
// a tela traduz 'reducao_observada', e não "a troca resolveu".
//
// Versão 2 (aprovada pelo Cesar em 08/10/2026, alinhada ao mock): os limiares
// vêm da política `inteligencia.efetividade`. Pela variação dos chamados:
// redução de 60% ou mais = redução observada; de 25% a menos de 60% = redução
// parcial; de mais de −25% a menos de +20% = sem mudança relevante; aumento de
// 20% ou mais = aumento observado; menos de 3 chamados antes = sem base de
// comparação; menos de 90 dias depois = janela incompleta (que vale primeiro).
// A versão 1 (limiar único de 20% nos dois sentidos) fica no que já foi gravado.
import type { Parada } from '@hubkeep/dominio';
import { type Corretiva, horasParadasNoTrecho } from './historico';
import { DIA_MS } from './score';

export const VERSAO_EFETIVIDADE = 2;

export interface Custo {
  em: Date;
  valor: number;
}

export interface EntradaEfetividade {
  intervencaoEm: Date;
  /** Corretivas do escopo (ativo, local, andar ou categoria), já filtradas. */
  corretivas: readonly Corretiva[];
  paradas: readonly Parada[];
  /** Custo informado das OS (`app.os.custo_informado`, I4); null sem dado. */
  custos?: readonly Custo[] | null;
}

export interface ConfigEfetividade {
  /** Tamanho do antes e do depois, em dias. */
  janelaDias: number;
  /** Redução dos chamados, em %, a partir da qual a redução é observada. */
  reducaoObservadaPercentual: number;
  /** Redução, em %, a partir da qual é parcial (até a observada, exclusive). */
  reducaoParcialPercentual: number;
  /** Aumento dos chamados, em %, a partir do qual o aumento é observado. */
  aumentoObservadoPercentual: number;
  /** Menos chamados que isto antes da intervenção: não há base de comparação. */
  minChamadosAntes: number;
}

export const PADRAO_EFETIVIDADE: ConfigEfetividade = {
  janelaDias: 90,
  reducaoObservadaPercentual: 60,
  reducaoParcialPercentual: 25,
  aumentoObservadoPercentual: 20,
  minChamadosAntes: 3,
};

/**
 * Os limiares só fazem sentido nesta ordem: a redução parcial começa antes da
 * observada (e acima de 0), e a observada não passa de 100%. Conferido ao
 * gravar a política, para o resultado nunca ser contraditório.
 */
export function limiaresDeEfetividadeValidos(c: ConfigEfetividade): boolean {
  return (
    Number.isInteger(c.janelaDias) &&
    c.janelaDias >= 1 &&
    Number.isInteger(c.minChamadosAntes) &&
    c.minChamadosAntes >= 1 &&
    c.reducaoParcialPercentual > 0 &&
    c.reducaoParcialPercentual < c.reducaoObservadaPercentual &&
    c.reducaoObservadaPercentual <= 100 &&
    c.aumentoObservadoPercentual > 0
  );
}

export type ChaveMetrica = 'chamados' | 'reaberturas' | 'horas_paradas' | 'custo';

export interface MetricaAntesDepois {
  chave: ChaveMetrica;
  antes: number;
  depois: number;
  /** null quando o antes é zero: não há base para a porcentagem. */
  variacaoPercentual: number | null;
}

export type ResultadoEfetividade =
  | 'reducao_observada'
  | 'reducao_parcial'
  | 'sem_mudanca_relevante'
  | 'aumento_observado'
  | 'sem_base_de_comparacao'
  | 'janela_incompleta';

export interface Efetividade {
  versao: number;
  resultado: ResultadoEfetividade;
  /** O depois ainda não completou a janela: as métricas são parciais. */
  diasDecorridos: number;
  metricas: readonly MetricaAntesDepois[];
  configuracao: ConfigEfetividade;
}

const variacao = (antes: number, depois: number): number | null =>
  antes === 0 ? null : Math.round(((depois - antes) / antes) * 1000) / 10;

export function efetividadeAntesDepois(
  e: EntradaEfetividade,
  agora: Date,
  config: ConfigEfetividade = PADRAO_EFETIVIDADE,
): Efetividade {
  const t = e.intervencaoEm.getTime();
  const janela = config.janelaDias * DIA_MS;
  const fimDepois = Math.min(t + janela, agora.getTime());
  const antes = (d: Date) => d.getTime() >= t - janela && d.getTime() < t;
  const depois = (d: Date) => d.getTime() >= t && d.getTime() < fimDepois;

  const contar = <T>(xs: readonly T[], f: (x: T) => boolean, v: (x: T) => number) =>
    xs.filter(f).reduce((s, x) => s + v(x), 0);

  const par = (chave: ChaveMetrica, a: number, d: number): MetricaAntesDepois => ({
    chave,
    antes: a,
    depois: d,
    variacaoPercentual: variacao(a, d),
  });

  const metricas: MetricaAntesDepois[] = [
    par(
      'chamados',
      contar(
        e.corretivas,
        (c) => antes(c.abertaEm),
        () => 1,
      ),
      contar(
        e.corretivas,
        (c) => depois(c.abertaEm),
        () => 1,
      ),
    ),
    par(
      'reaberturas',
      contar(
        e.corretivas,
        (c) => antes(c.abertaEm),
        (c) => c.reaberturas,
      ),
      contar(
        e.corretivas,
        (c) => depois(c.abertaEm),
        (c) => c.reaberturas,
      ),
    ),
    par(
      'horas_paradas',
      horasParadasNoTrecho(e.paradas, t - janela, t, agora),
      horasParadasNoTrecho(e.paradas, t, fimDepois, agora),
    ),
  ];
  if (e.custos) {
    const custos = e.custos;
    metricas.push(
      par(
        'custo',
        contar(
          custos,
          (c) => antes(c.em),
          (c) => c.valor,
        ),
        contar(
          custos,
          (c) => depois(c.em),
          (c) => c.valor,
        ),
      ),
    );
  }

  const diasDecorridos = Math.max(0, Math.floor((agora.getTime() - t) / DIA_MS));
  const chamados = metricas[0] as MetricaAntesDepois;
  let resultado: ResultadoEfetividade;
  if (agora.getTime() < t + janela) resultado = 'janela_incompleta';
  else if (chamados.variacaoPercentual === null || chamados.antes < config.minChamadosAntes)
    resultado = 'sem_base_de_comparacao';
  else if (-chamados.variacaoPercentual >= config.reducaoObservadaPercentual)
    resultado = 'reducao_observada';
  else if (-chamados.variacaoPercentual >= config.reducaoParcialPercentual)
    resultado = 'reducao_parcial';
  else if (chamados.variacaoPercentual >= config.aumentoObservadoPercentual)
    resultado = 'aumento_observado';
  else resultado = 'sem_mudanca_relevante';

  return { versao: VERSAO_EFETIVIDADE, resultado, diasDecorridos, metricas, configuracao: config };
}
