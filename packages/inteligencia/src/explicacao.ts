// "Por que estou vendo isso?" (ADR-034; PRD, seção 24): os motivos do score
// viram chave de catálogo e valores, e quem exibe formata pelo i18n (regra
// 11). O motor nunca devolve frase. A chave de cada motivo é
// `inteligencia.motivo.<score>.<componente>`, e os valores são os números e
// textos da evidência do componente (ids e listas ficam de fora: a tela mostra
// os registros pela evidência, filtrados pela RLS da origem).
import { type Score, motivosDoScore } from './score';

export interface Explicacao {
  chave: string;
  valores: Readonly<Record<string, string | number>>;
}

/** Chave do catálogo para o nome do score (`inteligencia.score.<chave>`). */
export const chaveDoNomeDoScore = (score: Pick<Score, 'chave'>): string =>
  `inteligencia.score.${score.chave}`;

/** Chave do catálogo para a faixa, inclusive 'dados_insuficientes'. */
export const chaveDaFaixa = (faixa: string): string => `inteligencia.faixa.${faixa}`;

/** Os motivos que mais pesaram, do maior para o menor, prontos para o catálogo. */
export function explicacaoDoScore(score: Score, quantos = 3): Explicacao[] {
  return motivosDoScore(score, quantos).map((c) => {
    const valores: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(c.evidencia))
      if (typeof v === 'number' || typeof v === 'string') valores[k] = v;
    return { chave: `inteligencia.motivo.${score.chave}.${c.chave}`, valores };
  });
}

/** Chave do catálogo para o nome do componente (`inteligencia.componente.<score>.<componente>`). */
export const chaveDoNomeDoComponente = (score: Pick<Score, 'chave'>, componente: string): string =>
  `inteligencia.componente.${score.chave}.${componente}`;

/** Chave do aviso de componente sem dado e de peso redistribuído (ADR-034). */
export const CHAVE_DO_AVISO_SEM_DADO = 'inteligencia.detalhamento.sem_dado';

export interface LinhaDoDetalhamento {
  componente: string;
  chaveDoNome: string;
  /** O componente não tem dado: não soma pontos e não recebe peso. */
  semDado: boolean;
  /** Peso configurado, de 0 a 1 sobre a soma dos pesos. */
  peso: number;
  /** Peso usado no cálculo, depois da redistribuição; 0 sem dado. */
  pesoUsado: number;
  /** De 0 a 1; null sem dado. */
  valor: number | null;
  pontos: number;
  valores: Readonly<Record<string, string | number>>;
}

export interface Detalhamento {
  linhas: readonly LinhaDoDetalhamento[];
  /**
   * Os componentes sem dado que tinham peso, na ordem do score. Vazio quando
   * nada foi redistribuído (o componente sem dado e com peso 0 não conta).
   */
  semDadoComPeso: readonly string[];
  /** Fração do peso configurado que foi dividida entre os componentes com dado, de 0 a 1. */
  pesoRedistribuido: number;
  /** A chave do aviso, ou null quando não houve redistribuição. */
  chaveDoAviso: string | null;
  /** Os valores do aviso, além dos nomes (`componentes`), que quem exibe monta pelo `chaveDoNome`. */
  valoresDoAviso: { quantidade: number; peso: number };
}

/**
 * "Como o score foi composto": uma linha por componente, o "sem dado" e a
 * redistribuição do peso, prontos para o catálogo. A regra é a mesma para
 * todo o tenant: o peso do componente sem dado vai para os presentes, na
 * proporção dos pesos (`combinar`).
 */
export function detalhamentoDoScore(score: Score): Detalhamento {
  const total = score.componentes.reduce((s, c) => s + c.peso, 0);
  const linhas = score.componentes.map((c): LinhaDoDetalhamento => {
    const valores: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(c.evidencia))
      if (typeof v === 'number' || typeof v === 'string') valores[k] = v;
    return {
      componente: c.chave,
      chaveDoNome: chaveDoNomeDoComponente(score, c.chave),
      semDado: c.valor === null,
      peso: total > 0 ? c.peso / total : 0,
      pesoUsado: c.pesoEfetivo,
      valor: c.valor,
      pontos: c.pontos,
      valores,
    };
  });
  const semDadoComPeso = score.componentes
    .filter((c) => c.valor === null && c.peso > 0)
    .map((c) => c.chave);
  const pesoRedistribuido = linhas
    .filter((l) => l.semDado && semDadoComPeso.includes(l.componente))
    .reduce((s, l) => s + l.peso, 0);
  const ha = semDadoComPeso.length > 0 && score.valor !== null;
  return {
    linhas,
    semDadoComPeso: ha ? semDadoComPeso : [],
    pesoRedistribuido: ha ? pesoRedistribuido : 0,
    chaveDoAviso: ha ? CHAVE_DO_AVISO_SEM_DADO : null,
    valoresDoAviso: {
      quantidade: ha ? semDadoComPeso.length : 0,
      peso: ha ? pesoRedistribuido : 0,
    },
  };
}
