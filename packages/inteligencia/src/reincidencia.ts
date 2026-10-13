// Recurring Failure Score (PRD, seção 12): o quanto as falhas de um ativo
// voltam depois das intervenções, com os componentes do PRD: corretivas na
// janela, intervalo entre falhas, reaberturas, mesma falha, falha logo depois
// de corretiva e falha logo depois de preventiva. A versão 2 (glossário de
// métricas versão 3, divergência b, 13/10/2026) tira da conta todo chamado
// cancelado; na 1, o cancelado com OS entrava. A versão 3 (divergência a)
// grava o dia no fuso do hotel, e não em UTC. O que já foi gravado com as
// versões anteriores não é recalculado (ADR-036).
import { type Corretiva, ordenarPorAbertura } from './historico';
import { DIA_MS, FAIXAS_PADRAO, type Faixa, type Score, combinar, razao } from './score';

export const VERSAO_REINCIDENCIA = 3;

export interface ConfigReincidencia {
  janelaDias: number;
  /** Corretivas na janela que dão o componente cheio. */
  limiteCorretivas: number;
  /** Intervalo médio que zera o componente; abaixo dele, quanto menor, maior. */
  intervaloReferenciaDias: number;
  limiteReaberturas: number;
  /** Falha até tantos dias depois da conclusão da anterior conta como volta. */
  diasAposCorretiva: number;
  pesos: {
    corretivas: number;
    intervalo: number;
    reaberturas: number;
    mesmaFalha: number;
    aposCorretiva: number;
    aposPreventiva: number;
  };
  faixas: readonly Faixa[];
}

export const PADRAO_REINCIDENCIA: ConfigReincidencia = {
  janelaDias: 90,
  limiteCorretivas: 5,
  intervaloReferenciaDias: 30,
  limiteReaberturas: 3,
  diasAposCorretiva: 30,
  pesos: {
    corretivas: 0.3,
    intervalo: 0.15,
    reaberturas: 0.15,
    mesmaFalha: 0.15,
    aposCorretiva: 0.15,
    aposPreventiva: 0.1,
  },
  faixas: FAIXAS_PADRAO,
};

/** Corretivas do ativo; as de fora da janela só servem de anterior à primeira. */
export function reincidencia(
  corretivas: readonly Corretiva[],
  agora: Date,
  config: ConfigReincidencia = PADRAO_REINCIDENCIA,
): Score<ConfigReincidencia> {
  const inicio = agora.getTime() - config.janelaDias * DIA_MS;
  const todas = ordenarPorAbertura(corretivas).filter(
    (c) => c.abertaEm.getTime() <= agora.getTime(),
  );
  const naJanela = todas.filter((c) => c.abertaEm.getTime() > inicio);
  const n = naJanela.length;

  const intervalos = naJanela
    .slice(1)
    .map((c, i) => (c.abertaEm.getTime() - (naJanela[i] as Corretiva).abertaEm.getTime()) / DIA_MS);
  const intervaloMedio = intervalos.length
    ? intervalos.reduce((s, x) => s + x, 0) / intervalos.length
    : null;

  const reaberturas = naJanela.reduce((s, c) => s + c.reaberturas, 0);

  const comCodigo = naJanela.filter((c) => c.codigoFalha !== null);
  const porCodigo = new Map<string, number>();
  for (const c of comCodigo)
    porCodigo.set(c.codigoFalha as string, (porCodigo.get(c.codigoFalha as string) ?? 0) + 1);
  const [codigoMaisFrequente, vezes] = [...porCodigo.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0] ?? [null, 0];

  // Volta depois de corretiva: aberta até X dias depois da conclusão da anterior.
  const voltas = naJanela.filter((c) => {
    const anterior = todas.filter((a) => a.abertaEm.getTime() < c.abertaEm.getTime()).at(-1);
    if (!anterior?.concluidaEm) return false;
    const dias = (c.abertaEm.getTime() - anterior.concluidaEm.getTime()) / DIA_MS;
    return dias >= 0 && dias <= config.diasAposCorretiva;
  });

  const comPreventiva = naJanela.filter((c) => c.aposPreventiva !== undefined);
  const aposPreventiva = comPreventiva.filter((c) => c.aposPreventiva).length;

  return combinar(
    'reincidencia',
    VERSAO_REINCIDENCIA,
    [
      {
        chave: 'corretivas',
        peso: config.pesos.corretivas,
        valor: razao(n, config.limiteCorretivas),
        evidencia: {
          quantidade: n,
          janelaDias: config.janelaDias,
          limite: config.limiteCorretivas,
        },
      },
      {
        chave: 'intervalo',
        peso: config.pesos.intervalo,
        valor:
          intervaloMedio === null ? 0 : 1 - razao(intervaloMedio, config.intervaloReferenciaDias),
        evidencia: {
          intervaloMedioDias: intervaloMedio === null ? null : Math.round(intervaloMedio * 10) / 10,
          referenciaDias: config.intervaloReferenciaDias,
        },
      },
      {
        chave: 'reaberturas',
        peso: config.pesos.reaberturas,
        valor: razao(reaberturas, config.limiteReaberturas),
        evidencia: { quantidade: reaberturas, limite: config.limiteReaberturas },
      },
      {
        chave: 'mesma_falha',
        peso: config.pesos.mesmaFalha,
        valor: comCodigo.length === 0 ? null : vezes >= 2 ? vezes / comCodigo.length : 0,
        evidencia: {
          codigoFalha: codigoMaisFrequente,
          quantidade: vezes,
          comCodigo: comCodigo.length,
        },
      },
      {
        chave: 'apos_corretiva',
        peso: config.pesos.aposCorretiva,
        valor: razao(voltas.length, Math.max(n - 1, 1)),
        evidencia: {
          quantidade: voltas.length,
          diasAposCorretiva: config.diasAposCorretiva,
          corretivaIds: voltas.map((c) => c.id),
        },
      },
      {
        chave: 'apos_preventiva',
        peso: config.pesos.aposPreventiva,
        valor: comPreventiva.length === 0 ? null : aposPreventiva / comPreventiva.length,
        evidencia: { quantidade: aposPreventiva, comDado: comPreventiva.length },
      },
    ],
    config.faixas,
    config,
  );
}
