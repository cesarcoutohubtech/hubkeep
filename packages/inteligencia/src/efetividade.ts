// Efetividade da intervenção (PRD, seção 16): o problema diminuiu depois que
// corrigimos? Compara a mesma janela antes e depois da data da intervenção.
// O resultado fala só em variação observada, nunca em causa (PRD, princípio 7):
// a tela traduz 'reducao_observada', e não "a troca resolveu".
//
// Versão 2 (aprovada pelo Cesar em 08/10/2026, alinhada ao mock, com as
// respostas de 10/10/2026): os limiares vêm da política
// `inteligencia.efetividade`. Pela variação dos chamados: redução de 60% ou
// mais = redução observada; de 25% a menos de 60% = redução parcial; de mais de
// −25% a menos de +20% = sem mudança relevante; aumento de 20% ou mais =
// aumento observado; menos de 3 chamados antes = sem base de comparação; menos
// de 90 dias depois = janela incompleta.
//
// Quando valem os dois, "sem base de comparação" prevalece: ele já é
// definitivo no dia da intervenção, porque menos chamados antes que o mínimo
// nunca vira uma comparação válida, por mais que a janela termine.
//
// A versão 1 (limiar único de 20% nos dois sentidos) nunca foi gravada: a
// efetividade é calculada sob demanda. A 2 também não chegou a ser gravada.
//
// Versão 3 (adendo ao ADR-033 de 15/10/2026, aprovado por Cesar e Kaio):
// - a intervenção é a OS corretiva concluída com o código de solução na lista
//   `codigosDeIntervencao` da política (padrão: só "Troca do equipamento");
//   quem a identifica é `intervencao.ts`;
// - o custo das corretivas, antes → depois, sai das próprias corretivas, pelo
//   aceite (glossário de métricas v3), sem a OS da intervenção, que é o custo
//   da troca e não da falha. Cada lado mostra a cobertura ("custo informado em
//   X de Y OS"); abaixo de 50% em qualquer um dos lados
//   (`COBERTURA_MINIMA_DO_CUSTO`, confirmado pelo Kaio em 15/10/2026), não há
//   variação: a tela mostra "dados insuficientes". O lado sem nenhuma OS
//   aceita tem custo zero conhecido e conta como coberto.
import type { Parada } from '@hubkeep/dominio';
import { type Corretiva, horasParadasNoTrecho } from './historico';
import { DIA_MS } from './score';

export const VERSAO_EFETIVIDADE = 3;

/** A parte das OS aceitas de cada lado que precisa ter o custo informado (adendo ao ADR-033). */
export const COBERTURA_MINIMA_DO_CUSTO = 0.5;

/** Os códigos de solução que contam como intervenção, sem política gravada. */
export const CODIGOS_DE_INTERVENCAO_PADRAO: readonly string[] = ['solucao_troca_do_equipamento'];

/** O máximo de códigos na lista da política. */
export const MAXIMO_DE_CODIGOS_DE_INTERVENCAO = 20;

export interface EntradaEfetividade {
  intervencaoEm: Date;
  /** Corretivas do escopo (o ativo), já filtradas, com o aceite e o custo informado. */
  corretivas: readonly Corretiva[];
  paradas: readonly Parada[];
  /** A corretiva da própria intervenção, que fica fora do custo; ausente sem ela. */
  intervencaoId?: string;
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
  /**
   * Os códigos de solução que fazem da OS uma intervenção: a chave padrão do
   * código (`app.codigo_manutencao.chave_padrao`) ou o id do código criado pelo
   * grupo. Ausente na política gravada antes da versão 3: vale o padrão. A
   * lista vazia desliga a efetividade.
   */
  codigosDeIntervencao?: readonly string[];
}

export const PADRAO_EFETIVIDADE: ConfigEfetividade = {
  janelaDias: 90,
  reducaoObservadaPercentual: 60,
  reducaoParcialPercentual: 25,
  aumentoObservadoPercentual: 20,
  minChamadosAntes: 3,
  codigosDeIntervencao: CODIGOS_DE_INTERVENCAO_PADRAO,
};

/** A lista de códigos da política, ou a do padrão quando a política é anterior à versão 3. */
export const codigosDeIntervencao = (c: ConfigEfetividade): readonly string[] =>
  c.codigosDeIntervencao ?? CODIGOS_DE_INTERVENCAO_PADRAO;

/** Até 20 códigos, cada um um texto não vazio de até 64 caracteres, sem repetir. */
export function listaDeCodigosValida(v: unknown): v is readonly string[] {
  return (
    Array.isArray(v) &&
    v.length <= MAXIMO_DE_CODIGOS_DE_INTERVENCAO &&
    v.every((c) => typeof c === 'string' && c.trim() === c && c.length > 0 && c.length <= 64) &&
    new Set(v).size === v.length
  );
}

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
    c.aumentoObservadoPercentual > 0 &&
    (c.codigosDeIntervencao === undefined || listaDeCodigosValida(c.codigosDeIntervencao))
  );
}

export type ChaveMetrica = 'chamados' | 'reaberturas' | 'horas_paradas';

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

/** O custo informado das OS aceitas de um lado da intervenção. */
export interface CustoDoLado {
  /** Soma das OS com o custo informado; 0 quando nenhuma tem. */
  soma: number;
  /** OS aceitas no lado com o custo preenchido (o X de "X de Y OS"). */
  informadas: number;
  /** OS aceitas no lado (o Y). */
  aceitas: number;
}

export interface CustoAntesDepois {
  antes: CustoDoLado;
  depois: CustoDoLado;
  /** Os dois lados com a cobertura mínima; senão, "dados insuficientes". */
  suficiente: boolean;
  /** null sem cobertura suficiente, ou com o antes em zero. */
  variacaoPercentual: number | null;
}

export interface Efetividade {
  versao: number;
  resultado: ResultadoEfetividade;
  /** O depois ainda não completou a janela: as métricas são parciais. */
  diasDecorridos: number;
  metricas: readonly MetricaAntesDepois[];
  /** O custo das corretivas, antes → depois, com a cobertura de cada lado. */
  custo: CustoAntesDepois;
  configuracao: ConfigEfetividade;
}

/** O lado tem a cobertura mínima; sem OS aceita, o custo é zero e é conhecido. */
export const ladoCoberto = (l: CustoDoLado): boolean =>
  l.aceitas === 0 || l.informadas >= COBERTURA_MINIMA_DO_CUSTO * l.aceitas;

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
  const custoDoLado = (dentro: (d: Date) => boolean): CustoDoLado => {
    const aceitas = e.corretivas.filter(
      (c) => c.id !== e.intervencaoId && c.aceitaEm !== null && dentro(c.aceitaEm),
    );
    const comCusto = aceitas.filter(
      (c) => c.custoInformado !== undefined && c.custoInformado !== null,
    );
    return {
      soma: comCusto.reduce((s, c) => s + (c.custoInformado as number), 0),
      informadas: comCusto.length,
      aceitas: aceitas.length,
    };
  };
  const custoAntes = custoDoLado(antes);
  const custoDepois = custoDoLado(depois);
  const suficiente = ladoCoberto(custoAntes) && ladoCoberto(custoDepois);
  const custo: CustoAntesDepois = {
    antes: custoAntes,
    depois: custoDepois,
    suficiente,
    variacaoPercentual: suficiente ? variacao(custoAntes.soma, custoDepois.soma) : null,
  };

  const diasDecorridos = Math.max(0, Math.floor((agora.getTime() - t) / DIA_MS));
  const chamados = metricas[0] as MetricaAntesDepois;
  let resultado: ResultadoEfetividade;
  if (chamados.variacaoPercentual === null || chamados.antes < config.minChamadosAntes)
    resultado = 'sem_base_de_comparacao';
  else if (agora.getTime() < t + janela) resultado = 'janela_incompleta';
  else if (-chamados.variacaoPercentual >= config.reducaoObservadaPercentual)
    resultado = 'reducao_observada';
  else if (-chamados.variacaoPercentual >= config.reducaoParcialPercentual)
    resultado = 'reducao_parcial';
  else if (chamados.variacaoPercentual >= config.aumentoObservadoPercentual)
    resultado = 'aumento_observado';
  else resultado = 'sem_mudanca_relevante';

  return {
    versao: VERSAO_EFETIVIDADE,
    resultado,
    diasDecorridos,
    metricas,
    custo,
    configuracao: config,
  };
}
