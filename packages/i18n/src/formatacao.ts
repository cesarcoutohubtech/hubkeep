// Formatação de data, número e moeda pelo Intl, com o formato regional e o
// fuso de quem vê (ADR-022). O formato regional é escolha separada do idioma:
// um membro pode ler em inglês com datas no formato brasileiro.
import type { FormatoRegional } from './idiomas';

export interface Formatador {
  readonly formatoRegional: FormatoRegional;
  readonly fuso: string;
  data(d: Date): string;
  dataHora(d: Date): string;
  hora(d: Date): string;
  numero(n: number, opcoes?: Intl.NumberFormatOptions): string;
  /** `moeda` em ISO 4217 (ex.: BRL, USD). */
  moeda(valor: number, moeda: string): string;
}

export function criarFormatador(opcoes: {
  formatoRegional: FormatoRegional;
  fuso: string;
}): Formatador {
  const { formatoRegional, fuso } = opcoes;
  const data = new Intl.DateTimeFormat(formatoRegional, { dateStyle: 'short', timeZone: fuso });
  const dataHora = new Intl.DateTimeFormat(formatoRegional, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: fuso,
  });
  const hora = new Intl.DateTimeFormat(formatoRegional, { timeStyle: 'short', timeZone: fuso });
  return {
    formatoRegional,
    fuso,
    data: (d) => data.format(d),
    dataHora: (d) => dataHora.format(d),
    hora: (d) => hora.format(d),
    numero: (n, o) => new Intl.NumberFormat(formatoRegional, o).format(n),
    moeda: (valor, moeda) =>
      new Intl.NumberFormat(formatoRegional, { style: 'currency', currency: moeda }).format(valor),
  };
}

/**
 * O separador do CSV pelo formato regional de quem exporta (decisão 7 da
 * paridade da 1c): ponto e vírgula onde a vírgula é o separador decimal (pt-BR,
 * es, fr), para a planilha abrir em colunas; vírgula nos outros.
 */
export function separadorDeCsv(formatoRegional: string): ';' | ',' {
  const decimal = new Intl.NumberFormat(formatoRegional)
    .formatToParts(1.5)
    .find((p) => p.type === 'decimal')?.value;
  return decimal === ',' ? ';' : ',';
}
