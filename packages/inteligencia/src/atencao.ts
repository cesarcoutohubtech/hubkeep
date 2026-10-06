// Asset Attention Score (PRD, seção 13): a fila gerencial de ativos que
// merecem investigação. Versão 1, com os pesos do exemplo do PRD. Criticidade
// e custo informado são opcionais: entram quando a instrumentação da 1b
// existir e o hotel preencher. O impacto no hóspede vem, no 1.0, do indicador
// do chamado (decisão de 05/10/2026), e a preventiva fica ausente até a 1b. O
// peso do componente ausente vai para os presentes, e a lista de ausentes
// mostra o que falta.
import { CRITICIDADE_MAXIMA, type Criticidade } from './historico';
import { FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_ATENCAO = 1;

export interface EntradaAtencao {
  /** De 1 a 5 (etapa I1 da 1b); null sem dado. */
  criticidade: Criticidade | null;
  /** O score de reincidência do mesmo ativo, na mesma data. */
  reincidencia: Score;
  /** Horas paradas na janela (parada do ativo, C5). */
  horasParadas: number | null;
  /**
   * Soma do custo informado no aceite em 12 meses (fase A, `custoInformadoNaJanela`);
   * null quando nenhuma OS tem custo informado.
   */
  custoInformado12m?: number | null;
  /**
   * Impacto no hóspede, de 0 a 100; null sem dado. No 1.0, a porcentagem dos
   * chamados que afetaram hóspede (`impactoHospedeDosChamados`); na 1.5, o
   * Guest Impact Score, com versão nova do score.
   */
  impactoHospede?: number | null;
  /** Preventiva vencida ou sinal de compliance aberto (1b); null sem dado. */
  preventivaOuCompliance?: boolean | null;
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
    criticidade: number;
    reincidencia: number;
    parada: number;
    custo: number;
    impactoHospede: number;
    preventivaOuCompliance: number;
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
    criticidade: 0.2,
    reincidencia: 0.2,
    parada: 0.15,
    custo: 0.15,
    impactoHospede: 0.2,
    preventivaOuCompliance: 0.1,
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
  const preventiva = e.preventivaOuCompliance ?? null;
  return combinar(
    'atencao_ativo',
    VERSAO_ATENCAO,
    [
      {
        chave: 'criticidade',
        peso: config.pesos.criticidade,
        valor: e.criticidade === null ? null : razao(e.criticidade, CRITICIDADE_MAXIMA),
        evidencia: { nivel: e.criticidade, maximo: CRITICIDADE_MAXIMA },
      },
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
        chave: 'custo',
        peso: config.pesos.custo,
        valor: custo === null ? null : razao(custo, config.limiteCusto12m),
        evidencia: { valor12m: custo, limite: config.limiteCusto12m },
      },
      {
        chave: 'impacto_hospede',
        peso: config.pesos.impactoHospede,
        valor: impacto === null ? null : razao(impacto, 100),
        evidencia: { score: impacto },
      },
      {
        chave: 'preventiva_ou_compliance',
        peso: config.pesos.preventivaOuCompliance,
        valor: preventiva === null ? null : preventiva ? 1 : 0,
        evidencia: { pendente: preventiva },
      },
    ],
    config.faixas,
    config,
  );
}
