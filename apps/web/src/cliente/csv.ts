// CSV gerado no navegador (fase 1c: auditoria geral; decisão 7 da paridade):
// o BOM no começo, para a planilha abrir em UTF-8, o separador pelo formato
// regional de quem exporta (separadorDeCsv, @hubkeep/i18n) e as linhas em CRLF.
// O campo com o separador, aspas ou quebra de linha vai entre aspas, com as
// aspas dobradas. O campo que começa com =, +, -, @, tabulação ou retorno
// ganha um apóstrofo na frente: o texto digitado por alguém (o nome de um
// local, a descrição de um chamado) não vira fórmula na planilha de quem abre.
// Depois de baixar, a tela avisa quantas linhas saíram e em que arquivo, só
// com o que o perfil de quem exporta enxerga (comum.csv_exportado; 1c, item 9).
import { chamarApi } from './api';

export const BOM = '﻿';

const FORMULA = /^[=+\-@\t\r]/;

export function campoDeCsv(valor: string, separador: string): string {
  const seguro = FORMULA.test(valor) ? `'${valor}` : valor;
  return seguro.includes(separador) || /["\r\n]/.test(seguro)
    ? `"${seguro.replace(/"/g, '""')}"`
    : seguro;
}

export const linhaDeCsv = (valores: readonly string[], separador: string): string =>
  valores.map((v) => campoDeCsv(v, separador)).join(separador);

/** O arquivo inteiro: o BOM, o cabeçalho e as linhas, em CRLF. */
export const arquivoCsv = (linhas: readonly (readonly string[])[], separador: string): string =>
  BOM + linhas.map((l) => linhaDeCsv(l, separador)).join('\r\n') + '\r\n';

/** Baixa o CSV no navegador, com o nome dado. */
export function baixarCsv(conteudo: string, nome: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** O formato regional de quem exporta (o perfil), ou o idioma da tela se a leitura falhar. */
export async function formatoDeQuemExporta(reserva: string): Promise<string> {
  const r = await chamarApi<{ formatoRegional: string }>('/api/v1/preferencias');
  return r.ok ? r.dados.formatoRegional : reserva;
}

/** A data local de hoje, AAAA-MM-DD, para o nome do arquivo. */
export function hojeNoArquivo(): string {
  const hoje = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}`;
}
