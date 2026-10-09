// Asset Attention Score (PRD, seção 13): a fila gerencial de ativos que
// merecem investigação.
//
// Versão 2 (aprovada pelo Cesar em 08/10/2026, alinhada ao mock): nove
// componentes, oito com peso e UH-dias com peso 0. Pesos padrão: reincidência
// 20, tempo parado 15, impacto no hóspede 15, criticidade 15, custo informado
// 10, preventiva atrasada 10, medições fora da faixa 10, garantia vencida 5 e
// UH-dias 0. A versão 1 (seis componentes) fica no que já foi gravado: o
// resultado de cada dia guarda a versão da fórmula (ADR-036), e nada gravado é
// recalculado em silêncio.
//
// Componente sem dado: o peso dele é dividido entre os presentes, na
// proporção dos pesos, e a lista de ausentes mostra o que falta. A regra é a
// mesma para todo o tenant: não há chave por hotel que a ligue ou desligue.
// - criticidade, custo informado, impacto no hóspede e garantia dependem do
//   que o hotel preencheu (instrumentação da 1b);
// - preventiva atrasada fica ausente até a etapa P;
// - medições fora da faixa ficam ausentes até o checklist tipado (PV1);
// - UH-dias fica ausente, com peso 0, até existir a origem do dado de UH
//   indisponível (proposta de 07/10/2026). Quando existir e o peso passar de
//   0, a atenção ganha a versão seguinte, com o limite e os pesos definidos.
import { CRITICIDADE_MAXIMA, type Criticidade, type SituacaoDaGarantia } from './historico';
import { FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_ATENCAO = 2;

/**
 * Medições do checklist tipado na janela (etapa PV1): quantas saíram da faixa
 * aceitável entre as feitas. null (ou sem nenhuma medição) é sem dado.
 */
export interface MedicoesDoAtivo {
  foraDaFaixa: number;
  total: number;
}

export interface EntradaAtencao {
  /** De 1 a 5 (etapa I1 da 1b); null sem dado. */
  criticidade: Criticidade | null;
  /** O score de reincidência do mesmo ativo, na mesma data. */
  reincidencia: Score;
  /** Horas paradas na janela (parada do ativo, C5). */
  horasParadas: number | null;
  /**
   * Soma do custo informado no aceite em 12 meses (`custoInformadoNaJanela`);
   * null quando nenhuma OS tem custo informado.
   */
  custoInformado12m?: number | null;
  /**
   * Impacto no hóspede, de 0 a 100; null sem dado. No 1.0, a porcentagem dos
   * chamados que afetaram hóspede (`impactoHospedeDosChamados`); na 1.5, o
   * Guest Impact Score, com versão nova do score.
   */
  impactoHospede?: number | null;
  /** Preventiva vencida do ativo (etapa P); null sem dado. */
  preventivaAtrasada?: boolean | null;
  /** Medições fora da faixa na janela (checklist tipado, PV1); null sem dado. */
  medicoes?: MedicoesDoAtivo | null;
  /** A garantia do ativo (`app.ativo.garantia_ate`); null sem a data. */
  garantia?: SituacaoDaGarantia | null;
}

export interface ConfigAtencao {
  /** Horas paradas na janela que dão o componente cheio. */
  limiteHorasParadas: number;
  /**
   * Custo informado em 12 meses, em reais, que dá o componente cheio. Sem o
   * custo de reposição (fase 2), a referência é da política do hotel.
   */
  limiteCusto12m: number;
  pesos: {
    reincidencia: number;
    parada: number;
    impactoHospede: number;
    criticidade: number;
    custo: number;
    preventivaAtrasada: number;
    medicoesForaDaFaixa: number;
    garantiaVencida: number;
    uhDias: number;
  };
  faixas: readonly Faixa[];
  /**
   * A partir deste valor, o score sugere insight (sugereInsight). Campo da
   * política inteligencia.atencao_ativo, com padrão 70 (Cesar, 06/10/2026).
   */
  limiteInsight: number;
}

export const PADRAO_ATENCAO: ConfigAtencao = {
  limiteHorasParadas: 48,
  limiteCusto12m: 10_000,
  pesos: {
    reincidencia: 0.2,
    parada: 0.15,
    impactoHospede: 0.15,
    criticidade: 0.15,
    custo: 0.1,
    preventivaAtrasada: 0.1,
    medicoesForaDaFaixa: 0.1,
    garantiaVencida: 0.05,
    uhDias: 0,
  },
  faixas: FAIXAS_PADRAO,
  limiteInsight: 70,
};

export function atencaoDoAtivo(
  e: EntradaAtencao,
  config: ConfigAtencao = PADRAO_ATENCAO,
): Score<ConfigAtencao> {
  const custo = e.custoInformado12m ?? null;
  const impacto = e.impactoHospede ?? null;
  const preventiva = e.preventivaAtrasada ?? null;
  const medicoes = e.medicoes && e.medicoes.total > 0 ? e.medicoes : null;
  const garantia = e.garantia ?? null;
  return combinar(
    'atencao_ativo',
    VERSAO_ATENCAO,
    [
      {
        chave: 'reincidencia',
        peso: config.pesos.reincidencia,
        valor: e.reincidencia.valor === null ? null : e.reincidencia.valor / 100,
        evidencia: {
          score: e.reincidencia.valor,
          faixa: e.reincidencia.faixa,
          versao: e.reincidencia.versao,
        },
      },
      {
        chave: 'parada',
        peso: config.pesos.parada,
        valor: e.horasParadas === null ? null : razao(e.horasParadas, config.limiteHorasParadas),
        evidencia: {
          horas: e.horasParadas === null ? null : Math.round(e.horasParadas * 10) / 10,
          limite: config.limiteHorasParadas,
        },
      },
      {
        chave: 'impacto_hospede',
        peso: config.pesos.impactoHospede,
        valor: impacto === null ? null : razao(impacto, 100),
        evidencia: { score: impacto },
      },
      {
        chave: 'criticidade',
        peso: config.pesos.criticidade,
        valor: e.criticidade === null ? null : razao(e.criticidade, CRITICIDADE_MAXIMA),
        evidencia: { nivel: e.criticidade, maximo: CRITICIDADE_MAXIMA },
      },
      {
        chave: 'custo',
        peso: config.pesos.custo,
        valor: custo === null ? null : razao(custo, config.limiteCusto12m),
        evidencia: { valor12m: custo, limite: config.limiteCusto12m },
      },
      {
        chave: 'preventiva_atrasada',
        peso: config.pesos.preventivaAtrasada,
        valor: preventiva === null ? null : preventiva ? 1 : 0,
        evidencia: { atrasada: preventiva },
      },
      {
        chave: 'medicoes_fora_da_faixa',
        peso: config.pesos.medicoesForaDaFaixa,
        valor: medicoes === null ? null : razao(medicoes.foraDaFaixa, medicoes.total),
        evidencia: {
          foraDaFaixa: medicoes?.foraDaFaixa ?? null,
          total: medicoes?.total ?? null,
        },
      },
      {
        chave: 'garantia_vencida',
        peso: config.pesos.garantiaVencida,
        valor: garantia === null ? null : garantia.vencida ? 1 : 0,
        evidencia: {
          vencida: garantia?.vencida ?? null,
          diasVencida: garantia?.diasVencida ?? null,
        },
      },
      {
        chave: 'uh_dias',
        peso: config.pesos.uhDias,
        valor: null,
        evidencia: {},
      },
    ],
    config.faixas,
    config,
  );
}
