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
