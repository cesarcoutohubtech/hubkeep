// HubKeep Intelligence: a forma comum dos scores (proposta ADR-INT-2 em
// docs/referencia/propostas-adr-inteligencia.md). Todo score é determinístico,
// versionado e explicável: devolve o valor de 0 a 100, a faixa, a versão da
// fórmula, a configuração usada e um componente por fator, com a evidência que
// o originou. O componente sem dado (campo da instrumentação ainda vazio, fonte
// que o tenant não tem) fica marcado como ausente, e o peso dele é dividido
// entre os presentes, na proporção dos pesos. Nada aqui é texto de interface:
// quem exibe traduz a chave do componente e da faixa pelo catálogo.

/** Evidência de um componente: números, códigos e ids, nunca frase. */
export type Evidencia = Readonly<
  Record<string, number | string | boolean | null | readonly string[]>
>;

export interface Componente {
  chave: string;
  /** Peso configurado. */
  peso: number;
  /** Peso depois de dividir o dos componentes ausentes; 0 quando ausente. */
  pesoEfetivo: number;
  /** De 0 a 1; null quando não há dado. */
  valor: number | null;
  /** Contribuição no score, de 0 a 100 (valor × peso efetivo × 100). */
  pontos: number;
  evidencia: Evidencia;
}

export interface Faixa {
  /** Limite inferior, inclusive, de 0 a 100. */
  desde: number;
  chave: string;
}

/** Faixas da seção 13 do PRD, as mesmas para todos os scores até haver política. */
export const FAIXAS_PADRAO: readonly Faixa[] = [
  { desde: 0, chave: 'normal' },
  { desde: 30, chave: 'observar' },
  { desde: 50, chave: 'atencao' },
  { desde: 70, chave: 'alta_atencao' },
  { desde: 85, chave: 'critico' },
];

export interface Score<C = unknown> {
  chave: string;
  versao: number;
  /** De 0 a 100, inteiro; null quando nenhum componente tem dado. */
  valor: number | null;
  /** Chave da faixa, ou 'dados_insuficientes'. */
  faixa: string;
  componentes: readonly Componente[];
  /** Chaves dos componentes sem dado, para a tela pedir o dado que falta. */
  ausentes: readonly string[];
  /** Cópia da configuração usada (como a política aplicada do ADR-026). */
  configuracao: C;
}

export interface Parte {
  chave: string;
  peso: number;
  valor: number | null;
  evidencia: Evidencia;
}

export const limitar = (x: number): number => Math.min(1, Math.max(0, x));

/** Razão limitada a [0, 1]; referência zero ou negativa conta como já atingida. */
export const razao = (x: number, referencia: number): number =>
  referencia > 0 ? limitar(x / referencia) : x > 0 ? 1 : 0;

export function faixaDe(valor: number | null, faixas: readonly Faixa[]): string {
  if (valor === null) return 'dados_insuficientes';
  let chave = faixas[0]?.chave ?? 'normal';
  for (const f of [...faixas].sort((a, b) => a.desde - b.desde))
    if (valor >= f.desde) chave = f.chave;
  return chave;
}

export function combinar<C>(
  chave: string,
  versao: number,
  partes: readonly Parte[],
  faixas: readonly Faixa[],
  configuracao: C,
): Score<C> {
  const presentes = partes.filter((p) => p.valor !== null && p.peso > 0);
  const soma = presentes.reduce((s, p) => s + p.peso, 0);
  const componentes = partes.map((p): Componente => {
    const pesoEfetivo = p.valor !== null && soma > 0 ? p.peso / soma : 0;
    const valor = p.valor === null ? null : limitar(p.valor);
    return {
      chave: p.chave,
      peso: p.peso,
      pesoEfetivo,
      valor,
      pontos: (valor ?? 0) * pesoEfetivo * 100,
      evidencia: p.evidencia,
    };
  });
  const valor = soma > 0 ? Math.round(componentes.reduce((s, c) => s + c.pontos, 0)) : null;
  return {
    chave,
    versao,
    valor,
    faixa: faixaDe(valor, faixas),
    componentes,
    ausentes: partes.filter((p) => p.valor === null).map((p) => p.chave),
    configuracao,
  };
}

/** Limite padrão para o score sugerir um insight (proposta ADR-INT-1). */
export const LIMITE_INSIGHT_PADRAO = 70;

/** O score sugere insight; quem abre, revisa e descarta é a aplicação, com uma pessoa. */
export const sugereInsight = (score: Score, limite = LIMITE_INSIGHT_PADRAO): boolean =>
  score.valor !== null && score.valor >= limite;

/**
 * "Por que estou vendo isso?" (PRD, seção 24): os componentes que mais pesaram
 * no score, do maior para o menor, sem os ausentes e os que não somaram nada.
 * A tela traduz cada um pela chave e pela evidência; o detalhamento completo
 * continua em `componentes`.
 */
export function motivosDoScore(score: Score, quantos = 3): Componente[] {
  return score.componentes
    .filter((c) => c.valor !== null && c.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.chave.localeCompare(b.chave))
    .slice(0, quantos);
}

export const DIA_MS = 86_400_000;
export const HORA_MS = 3_600_000;
