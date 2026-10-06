// Sinal de Repair vs Replace (PRD, seção 14): o ativo merece análise de
// substituição? Nunca decide: conta critérios atingidos, cada um com o valor e
// o limite, e a lista é a justificativa. Critério sem dado fica como não
// avaliado (atingido null), e não conta. Custo, garantia e valor de reposição
// dependem da instrumentação (fase A); a tela de decisão é da 2.0.
import { CRITICIDADE_MAXIMA, type Criticidade } from './historico';
import { razao } from './score';

export const VERSAO_SUBSTITUICAO = 1;

export interface EntradaSubstituicao {
  corretivas12m: number;
  horasParadas12m: number | null;
  idadeAnos: number | null;
  custo12m: number | null;
  custoReposicao: number | null;
  /** Guest Impact Score, de 0 a 100 (1.5). */
  impactoHospede: number | null;
  criticidade: Criticidade | null;
  /** Score de reincidência, de 0 a 100. */
  reincidencia: number | null;
  garantiaVigente: boolean | null;
}

export interface ConfigSubstituicao {
  limites: {
    corretivas12m: number;
    horasParadas12m: number;
    idadeAnos: number;
    /** Custo de 12 meses sobre o valor de reposição. */
    custoSobreReposicao: number;
    impactoHospede: number;
    /** Nível sobre o máximo da escala. */
    criticidade: number;
    reincidencia: number;
  };
  minimoParaObservar: number;
  minimoParaAvaliar: number;
}

export const PADRAO_SUBSTITUICAO: ConfigSubstituicao = {
  limites: {
    corretivas12m: 6,
    horasParadas12m: 40,
    idadeAnos: 10,
    custoSobreReposicao: 0.5,
    impactoHospede: 70,
    criticidade: 0.75,
    reincidencia: 70,
  },
  minimoParaObservar: 2,
  minimoParaAvaliar: 4,
};

export type SinalDeSubstituicao =
  | 'sem_sinal'
  | 'observar'
  | 'avaliar_substituicao'
  /** Ativo na garantia com critérios atingidos: revisar com o fornecedor antes. */
  | 'revisao_necessaria';

export interface Criterio {
  chave: keyof ConfigSubstituicao['limites'];
  valor: number | null;
  limite: number;
  /** null: sem dado para avaliar. */
  atingido: boolean | null;
}

export interface Substituicao {
  versao: number;
  sinal: SinalDeSubstituicao;
  atingidos: number;
  criterios: readonly Criterio[];
  garantiaVigente: boolean | null;
  configuracao: ConfigSubstituicao;
}

export function sinalDeSubstituicao(
  e: EntradaSubstituicao,
  config: ConfigSubstituicao = PADRAO_SUBSTITUICAO,
): Substituicao {
  const l = config.limites;
  const custoRelativo =
    e.custo12m !== null && e.custoReposicao !== null && e.custoReposicao > 0
      ? Math.round((e.custo12m / e.custoReposicao) * 1000) / 1000
      : null;
  const crit = (chave: Criterio['chave'], valor: number | null): Criterio => ({
    chave,
    valor,
    limite: l[chave],
    atingido: valor === null ? null : valor >= l[chave],
  });
  const criterios = [
    crit('corretivas12m', e.corretivas12m),
    crit('horasParadas12m', e.horasParadas12m),
    crit('idadeAnos', e.idadeAnos),
    crit('custoSobreReposicao', custoRelativo),
    crit('impactoHospede', e.impactoHospede),
    crit('criticidade', e.criticidade === null ? null : razao(e.criticidade, CRITICIDADE_MAXIMA)),
    crit('reincidencia', e.reincidencia),
  ];
  const atingidos = criterios.filter((c) => c.atingido === true).length;

  let sinal: SinalDeSubstituicao = 'sem_sinal';
  if (atingidos >= config.minimoParaObservar && e.garantiaVigente === true)
    sinal = 'revisao_necessaria';
  else if (atingidos >= config.minimoParaAvaliar) sinal = 'avaliar_substituicao';
  else if (atingidos >= config.minimoParaObservar) sinal = 'observar';

  return {
    versao: VERSAO_SUBSTITUICAO,
    sinal,
    atingidos,
    criterios,
    garantiaVigente: e.garantiaVigente,
    configuracao: config,
  };
}
