// A leitura do CSV de reclamações no navegador (ADR-047): o arquivo não sai
// do aparelho inteiro, só as colunas do HubKeep (COLUNAS_DO_CSV_API) de cada
// linha. As outras colunas (nome, contato ou reserva do hóspede, se vierem)
// ficam de fora, e a tela diz quais. O separador é o do cabeçalho: vírgula ou
// ponto e vírgula (a planilha em português exporta com ponto e vírgula). O
// campo entre aspas pode ter o separador, aspas dobradas e quebra de linha.
// A validação de cada linha é do servidor.
import {
  COLUNAS_DO_CSV_API,
  COLUNAS_OBRIGATORIAS_DO_CSV_API,
  LIMITE_DA_IMPORTACAO_API,
} from '@hubkeep/contratos';
import { BOM } from '../../../../cliente/csv';

export type ColunaDoCsv = (typeof COLUNAS_DO_CSV_API)[number];
export type LinhaDoCsv = { [C in ColunaDoCsv]?: string };

export type LeituraDoCsv =
  | {
      ok: true;
      linhas: LinhaDoCsv[];
      /** A linha de cada uma no arquivo, contando o cabeçalho como 1. */
      linhasNoArquivo: number[];
      ignoradas: string[];
    }
  | { ok: false; erro: 'sem_linhas' }
  | { ok: false; erro: 'colunas_faltando'; faltando: string[] }
  | { ok: false; erro: 'muitas_linhas'; limite: number };

/** Os registros do texto, com a linha em que cada um começa. */
function registros(texto: string, separador: string): { campos: string[]; linha: number }[] {
  const saida: { campos: string[]; linha: number }[] = [];
  let campos: string[] = [];
  let campo = '';
  let aspas = false;
  let linha = 1;
  let inicio = 1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else {
        if (c === '\n') linha++;
        campo += c;
      }
    } else if (c === '"' && campo === '') aspas = true;
    else if (c === separador) {
      campos.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      campos.push(campo);
      saida.push({ campos, linha: inicio });
      campos = [];
      campo = '';
      linha++;
      inicio = linha;
    } else campo += c;
  }
  if (campo !== '' || campos.length) {
    campos.push(campo);
    saida.push({ campos, linha: inicio });
  }
  return saida;
}

/** O separador do cabeçalho: o ponto e vírgula, se ele aparece mais que a vírgula. */
export function separadorDoCabecalho(texto: string): ',' | ';' {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const conta = (c: string) => primeira.split(c).length - 1;
  return conta(';') > conta(',') ? ';' : ',';
}

export function lerCsvDeSinais(bruto: string): LeituraDoCsv {
  const texto = bruto.startsWith(BOM) ? bruto.slice(BOM.length) : bruto;
  const separador = separadorDoCabecalho(texto);
  const todos = registros(texto, separador).filter((r) => r.campos.some((c) => c.trim() !== ''));
  const [cabecalho, ...corpo] = todos;
  if (!cabecalho || !corpo.length) return { ok: false, erro: 'sem_linhas' };
  const nomes = cabecalho.campos.map((c) => c.trim().toLowerCase());
  const conhecidas = COLUNAS_DO_CSV_API as readonly string[];
  const faltando = COLUNAS_OBRIGATORIAS_DO_CSV_API.filter((c) => !nomes.includes(c));
  if (faltando.length) return { ok: false, erro: 'colunas_faltando', faltando };
  if (corpo.length > LIMITE_DA_IMPORTACAO_API) {
    return { ok: false, erro: 'muitas_linhas', limite: LIMITE_DA_IMPORTACAO_API };
  }
  const ignoradas = cabecalho.campos
    .map((c) => c.trim())
    .filter((c, i) => c !== '' && !conhecidas.includes(nomes[i] ?? ''));
  const linhas = corpo.map((r) => {
    const l: LinhaDoCsv = {};
    nomes.forEach((nome, i) => {
      // A primeira coluna com o nome vale; a repetida fica de fora.
      if (conhecidas.includes(nome) && nomes.indexOf(nome) === i) {
        l[nome as ColunaDoCsv] = r.campos[i] ?? '';
      }
    });
    return l;
  });
  return { ok: true, linhas, linhasNoArquivo: corpo.map((r) => r.linha), ignoradas };
}

/** O que cabe num pedido: abaixo do limite do corpo da rota, com folga para o resto do JSON. */
export const BYTES_POR_PARTE = 900 * 1024;

/** As linhas em partes, cada uma abaixo de `limite` bytes em JSON. */
export function partesDaImportacao<T>(linhas: readonly T[], limite = BYTES_POR_PARTE): T[][] {
  const codificador = new TextEncoder();
  const partes: T[][] = [];
  let atual: T[] = [];
  let bytes = 0;
  for (const l of linhas) {
    const tamanho = codificador.encode(JSON.stringify(l)).length + 1;
    if (atual.length && bytes + tamanho > limite) {
      partes.push(atual);
      atual = [];
      bytes = 0;
    }
    atual.push(l);
    bytes += tamanho;
  }
  if (atual.length) partes.push(atual);
  return partes;
}

/** O modelo para baixar: só o cabeçalho, na ordem das colunas. */
export const CABECALHO_DO_MODELO = COLUNAS_DO_CSV_API.join(',');
