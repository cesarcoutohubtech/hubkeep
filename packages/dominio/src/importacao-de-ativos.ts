// Importação de ativos por planilha (fase 1b, M2; desenho em
// docs/referencia/propostas-desenho-pv-implantacao.md e decisões 18 e 19 do
// Cesar, de 19/10/2026).
//
//   - CSV em UTF-8, com ou sem BOM, separado por ponto e vírgula ou vírgula (o
//     separador sai do cabeçalho); até 2.000 linhas e 2 MB por envio
//     (importacao_limite). XLSX fica para depois: o Excel salva em CSV;
//   - as colunas são as do modelo baixado na tela: as fixas e uma por campo
//     estendido (campo.<chave>). Só local e nome são obrigatórias no cabeçalho;
//   - o local se acha pelo nome e, se preciso, pela edificação; o que não existe
//     recusa a linha (importacao_local_nao_encontrado), sem criar o local;
//   - a categoria se acha por qualquer um dos nomes dela, nos quatro idiomas; o
//     modelo (M1), pelo nome, dentro da categoria quando ela vem na linha. O
//     modelo preenche o que a linha deixou vazio, como no cadastro na tela;
//   - cada linha passa pelas mesmas regras do cadastro do ativo, e os erros
//     voltam todos, por linha, com código, coluna e parâmetros;
//   - a chave de importação é o resumo da linha normalizada (local, categoria,
//     nome e série): a linha que já entrou volta como já importada, e a mesma
//     linha repetida no arquivo é recusada.
// O código QR reservado (M3) ainda não existe: a coluna entra com a M3.
import { type ValorDeCampo, type DefinicaoDeCampo } from './campos-tipados';
import {
  type CategoriaParaAtivo,
  type Criticidade,
  ehDataDeCalendario,
  exigirLocalParaAtivo,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  validarCamposDoAtivo,
  validarCriticidade,
  validarDatasDoAtivo,
} from './ativos';
import { ErroDeDominio, type Parametros, RegraViolada } from './erros';
import type { StatusDeLocal } from './licenca';
import { preencherComModelo, validarModeloDoAtivo } from './modelos-de-ativo';
import { sha256, tamanhoUtf8 } from './resumo-sha256';

export const LIMITES_DA_IMPORTACAO = { linhas: 2000, bytes: 2 * 1024 * 1024 } as const;

/** As colunas fixas do modelo da planilha, na ordem do modelo. */
export const COLUNAS_DA_IMPORTACAO = [
  'local',
  'edificacao',
  'categoria',
  'modelo',
  'nome',
  'fabricante',
  'modelo_do_fabricante',
  'numero_serie',
  'data_compra',
  'garantia_ate',
  'criticidade',
] as const;
export type ColunaDaImportacao = (typeof COLUNAS_DA_IMPORTACAO)[number];

/** As colunas que o cabeçalho precisa ter. */
export const COLUNAS_OBRIGATORIAS: readonly ColunaDaImportacao[] = ['local', 'nome'];

export const PREFIXO_DE_CAMPO = 'campo.';

/** Separador do modelo baixado: o do Excel em português. */
export const SEPARADOR_DO_MODELO = ';';

export interface LinhaDoCsv {
  /** A linha do arquivo onde o registro começa (o cabeçalho é a 1). */
  numero: number;
  celulas: string[];
}

export interface CsvLido {
  separador: ',' | ';';
  cabecalho: string[];
  linhas: LinhaDoCsv[];
}

const limite = (qual: 'linhas' | 'bytes', maximo: number): never => {
  throw new RegraViolada('importacao_limite', 'A planilha passa do limite.', {
    limite: qual,
    maximo,
  });
};

/** O separador do cabeçalho: o que aparece mais fora de aspas (empate: ponto e vírgula). */
function separadorDe(texto: string): ',' | ';' {
  let virgulas = 0;
  let pontosEVirgulas = 0;
  let aspas = false;
  for (const c of texto) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && (c === '\n' || c === '\r')) break;
    else if (!aspas && c === ',') virgulas++;
    else if (!aspas && c === ';') pontosEVirgulas++;
  }
  return virgulas > pontosEVirgulas ? ',' : ';';
}

/**
 * Lê o CSV (RFC 4180): aspas duplas em volta da célula, aspa dobrada dentro
 * dela, quebra de linha dentro de aspas, CRLF ou LF. Linhas em branco são
 * puladas. Aspas que não fecham: importacao_csv_invalido, com a linha.
 */
export function lerCsv(texto: string): CsvLido {
  if (tamanhoUtf8(texto) > LIMITES_DA_IMPORTACAO.bytes)
    limite('bytes', LIMITES_DA_IMPORTACAO.bytes);
  const semBom = texto.startsWith('﻿') ? texto.slice(1) : texto;
  const separador = separadorDe(semBom);
  const registros: LinhaDoCsv[] = [];
  let celulas: string[] = [];
  let celula = '';
  let aspas = false;
  let linha = 1;
  let inicio = 1;
  const fecharRegistro = () => {
    celulas.push(celula);
    if (celulas.some((c) => c.trim() !== '')) registros.push({ numero: inicio, celulas });
    celulas = [];
    celula = '';
  };
  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i];
    if (aspas) {
      if (c === '"') {
        if (semBom[i + 1] === '"') {
          celula += '"';
          i++;
        } else aspas = false;
      } else {
        if (c === '\n') linha++;
        celula += c;
      }
      continue;
    }
    if (c === '"' && celula.trim() === '') {
      celula = '';
      aspas = true;
    } else if (c === separador) {
      celulas.push(celula);
      celula = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && semBom[i + 1] === '\n') i++;
      fecharRegistro();
      linha++;
      inicio = linha;
    } else celula += c;
  }
  if (aspas) {
    throw new RegraViolada('importacao_csv_invalido', 'Aspas sem fechar no CSV.', {
      linha: inicio,
    });
  }
  fecharRegistro();
  const [cabecalho, ...linhas] = registros;
  if (!cabecalho || linhas.length === 0) {
    throw new RegraViolada('importacao_vazia', 'A planilha não tem linhas de ativo.');
  }
  if (linhas.length > LIMITES_DA_IMPORTACAO.linhas) limite('linhas', LIMITES_DA_IMPORTACAO.linhas);
  return { separador, cabecalho: cabecalho.celulas, linhas };
}

/** Texto para comparar nomes: sem acento, sem caixa e sem espaço sobrando. */
export function paraComparar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Onde está cada coluna no arquivo. */
export interface ColunasDoArquivo {
  fixas: Partial<Record<ColunaDaImportacao, number>>;
  /** chave do campo estendido → posição. */
  campos: Map<string, number>;
  /** Quantas colunas o cabeçalho tem: célula preenchida depois disso recusa a linha. */
  total: number;
}

/**
 * Confere o cabeçalho: só colunas do modelo, sem repetir, com as obrigatórias.
 * `chavesDeCampo` são as chaves de campo estendido de alguma categoria do tenant.
 */
export function lerCabecalho(
  cabecalho: readonly string[],
  chavesDeCampo: ReadonlySet<string>,
): ColunasDoArquivo {
  const colunas: ColunasDoArquivo = { fixas: {}, campos: new Map(), total: cabecalho.length };
  const vistas = new Set<string>();
  cabecalho.forEach((bruto, posicao) => {
    const nome = bruto.trim().toLowerCase();
    if (nome === '') return;
    if (vistas.has(nome)) {
      throw new RegraViolada('importacao_coluna_repetida', 'Coluna repetida.', { coluna: nome });
    }
    vistas.add(nome);
    if ((COLUNAS_DA_IMPORTACAO as readonly string[]).includes(nome)) {
      colunas.fixas[nome as ColunaDaImportacao] = posicao;
    } else if (
      nome.startsWith(PREFIXO_DE_CAMPO) &&
      chavesDeCampo.has(nome.slice(PREFIXO_DE_CAMPO.length))
    ) {
      colunas.campos.set(nome.slice(PREFIXO_DE_CAMPO.length), posicao);
    } else {
      throw new RegraViolada('importacao_coluna_desconhecida', 'Coluna fora do modelo.', {
        coluna: nome,
      });
    }
  });
  for (const obrigatoria of COLUNAS_OBRIGATORIAS) {
    if (colunas.fixas[obrigatoria] === undefined) {
      throw new RegraViolada('importacao_coluna_obrigatoria', 'Falta coluna obrigatória.', {
        coluna: obrigatoria,
      });
    }
  }
  return colunas;
}

/** O cabeçalho do modelo da planilha, com o BOM para o Excel ler em UTF-8. */
export function modeloDaPlanilha(
  categorias: readonly { definicoes: readonly DefinicaoDeCampo[] }[],
) {
  const chaves = [...new Set(categorias.flatMap((c) => c.definicoes.map((d) => d.chave)))];
  const colunas = [...COLUNAS_DA_IMPORTACAO, ...chaves.map((c) => `${PREFIXO_DE_CAMPO}${c}`)];
  return `﻿${colunas.join(SEPARADOR_DO_MODELO)}\r\n`;
}

const DATA_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Data da planilha: aaaa-mm-dd ou dd/mm/aaaa (como o Excel em português salva). */
export function lerDataDaPlanilha(celula: string): string | undefined {
  const v = celula.trim();
  const br = DATA_BR.exec(v);
  const iso = br ? `${br[3]}-${br[2]?.padStart(2, '0')}-${br[1]?.padStart(2, '0')}` : v;
  return ehDataDeCalendario(iso) ? iso : undefined;
}

const NUMERO = /^[+-]?\d+([.,]\d+)?$/;
const SIM = new Set(['sim', 's', 'yes', 'y', 'si', 'oui', 'true', 'verdadeiro', '1']);
const NAO = new Set(['nao', 'n', 'no', 'non', 'false', 'falso', '0']);

/** O valor da célula no tipo do campo estendido; undefined se não couber. */
export function lerValorDaPlanilha(d: DefinicaoDeCampo, celula: string): ValorDeCampo | undefined {
  const v = celula.trim();
  switch (d.tipo) {
    case 'texto':
      return v;
    case 'numero':
      return NUMERO.test(v) ? Number(v.replace(',', '.')) : undefined;
    case 'data':
      return lerDataDaPlanilha(v);
    case 'sim_nao': {
      const c = paraComparar(v);
      return SIM.has(c) ? true : NAO.has(c) ? false : undefined;
    }
    case 'lista': {
      const c = paraComparar(v);
      return d.opcoes.find(
        (o) =>
          paraComparar(o.chave) === c ||
          Object.values(o.rotulos).some((r) => r !== undefined && paraComparar(r) === c),
      )?.chave;
    }
  }
}

export interface LocalDaImportacao {
  id: string;
  nome: string;
  edificacao: string | null;
  status: StatusDeLocal;
}

export interface CategoriaDaImportacao extends CategoriaParaAtivo {
  /** Os nomes que a planilha pode usar: os da categoria e, na padrão, os do catálogo. */
  nomes: readonly string[];
}

export interface ModeloDaImportacao {
  id: string;
  categoriaId: string;
  nome: string;
  ativa: boolean;
  fabricante: string | null;
  modelo: string | null;
  campos: unknown;
}

export interface ReferenciasDaImportacao {
  /** Os locais do hotel. */
  locais: readonly LocalDaImportacao[];
  categorias: readonly CategoriaDaImportacao[];
  modelos: readonly ModeloDaImportacao[];
  /** As chaves de importação que já estão no hotel. */
  chavesExistentes: ReadonlySet<string>;
}

export interface ErroDaLinha {
  codigo: string;
  /** A coluna do problema; null quando é a linha toda. */
  coluna: string | null;
  parametros: Parametros;
}

/** O ativo que a linha válida cria, já pelas regras do cadastro. */
export interface AtivoDaImportacao {
  localId: string;
  chaveImportacao: string;
  categoriaId: string | null;
  modeloId: string | null;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  dataCompra: string | null;
  garantiaAte: string | null;
  criticidade: Criticidade | null;
  campos: Record<string, ValorDeCampo>;
}

export type SituacaoDaLinha = 'nova' | 'ja_importada' | 'invalida';

export interface LinhaAnalisada {
  numero: number;
  situacao: SituacaoDaLinha;
  /** O nome do ativo como saiu da linha, para a prévia; null se não deu para ler. */
  nome: string | null;
  erros: ErroDaLinha[];
  /** Só na linha nova. */
  ativo: AtivoDaImportacao | null;
}

export interface ResultadoDaImportacao {
  linhas: LinhaAnalisada[];
  novas: number;
  jaImportadas: number;
  invalidas: number;
}

/** A chave de importação da linha: o resumo de local, categoria, nome e série. */
export function chaveDeImportacao(a: {
  localId: string;
  categoriaId: string | null;
  nome: string;
  numeroSerie: string | null;
}): string {
  const partes = [
    a.localId,
    a.categoriaId ?? '',
    paraComparar(a.nome),
    paraComparar(a.numeroSerie ?? ''),
  ];
  return `v1:${sha256(partes.join('\u001f'))}`;
}

function umSo<T>(achados: readonly T[], nada: () => never, muitos: () => never): T {
  if (achados.length === 0) nada();
  if (achados.length > 1) muitos();
  return achados[0] as T;
}

const recusa = (codigo: string, parametros: Parametros = {}): never => {
  throw new RegraViolada(codigo, codigo, parametros);
};

/** Analisa uma linha contra as referências do hotel, sem gravar. */
function analisarLinha(
  linha: LinhaDoCsv,
  colunas: ColunasDoArquivo,
  refs: ReferenciasDaImportacao,
): Omit<LinhaAnalisada, 'situacao'> & { chave: string | null } {
  const erros: ErroDaLinha[] = [];
  const tentar = <T>(coluna: string | null, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      if (!(e instanceof ErroDeDominio)) throw e;
      erros.push({ codigo: e.codigo, coluna, parametros: e.parametros });
      return undefined;
    }
  };
  const celula = (c: ColunaDaImportacao): string => {
    const i = colunas.fixas[c];
    return i === undefined ? '' : (linha.celulas[i] ?? '').trim();
  };
  const opcional = (c: ColunaDaImportacao): string | null => (celula(c) === '' ? null : celula(c));
  if (linha.celulas.slice(colunas.total).some((c) => c.trim() !== '')) {
    erros.push({ codigo: 'importacao_celulas_demais', coluna: null, parametros: {} });
  }

  const local = tentar('local', () => {
    const nome = celula('local');
    if (nome === '') recusa('importacao_celula_obrigatoria', { coluna: 'local' });
    const edificacao = opcional('edificacao');
    const candidatos = refs.locais.filter(
      (l) =>
        paraComparar(l.nome) === paraComparar(nome) &&
        (edificacao === null || paraComparar(l.edificacao ?? '') === paraComparar(edificacao)),
    );
    const l = umSo(
      candidatos,
      () => recusa('importacao_local_nao_encontrado', { local: nome }),
      () => recusa('importacao_local_ambiguo', { local: nome }),
    );
    exigirLocalParaAtivo(l);
    return l;
  });

  const nomeDaCategoria = opcional('categoria');
  const informada = tentar('categoria', () =>
    nomeDaCategoria === null
      ? null
      : umSo(
          refs.categorias.filter((c) =>
            c.nomes.some((n) => paraComparar(n) === paraComparar(nomeDaCategoria)),
          ),
          () => recusa('importacao_categoria_nao_encontrada', { categoria: nomeDaCategoria }),
          () => recusa('importacao_categoria_ambigua', { categoria: nomeDaCategoria }),
        ),
  );

  const nomeDoModelo = opcional('modelo');
  const modelo =
    informada === undefined
      ? undefined
      : tentar('modelo', () => {
          if (nomeDoModelo === null) return null;
          const m = umSo(
            refs.modelos.filter(
              (m) =>
                paraComparar(m.nome) === paraComparar(nomeDoModelo) &&
                (informada === null || m.categoriaId === informada.id),
            ),
            () => recusa('importacao_modelo_nao_encontrado', { modelo: nomeDoModelo }),
            () => recusa('importacao_modelo_ambiguo', { modelo: nomeDoModelo }),
          );
          validarModeloDoAtivo(m, m.categoriaId);
          return m;
        });
  // Sem categoria na linha, ela vem do modelo.
  const categoria =
    modelo && informada === null
      ? (refs.categorias.find((c) => c.id === modelo.categoriaId) ?? null)
      : informada;

  // Campos estendidos: no tipo do campo e só os da categoria da linha.
  const valores: Record<string, ValorDeCampo> = {};
  for (const [chave, posicao] of colunas.campos) {
    const bruto = (linha.celulas[posicao] ?? '').trim();
    if (bruto === '' || categoria === undefined) continue;
    const coluna = `${PREFIXO_DE_CAMPO}${chave}`;
    tentar(coluna, () => {
      const d = categoria?.definicoes.find((x) => x.chave === chave);
      if (!d) recusa('importacao_campo_de_outra_categoria', { campo: chave });
      const v = lerValorDaPlanilha(d as DefinicaoDeCampo, bruto);
      if (v === undefined) recusa('valor_de_campo_invalido', { campo: chave });
      valores[chave] = v as ValorDeCampo;
    });
  }

  let preenchido = {
    categoriaId: categoria?.id ?? null,
    nome: celula('nome'),
    fabricante: opcional('fabricante'),
    modelo: opcional('modelo_do_fabricante'),
    campos: valores,
  };
  if (modelo && categoria) {
    preenchido = preencherComModelo(preenchido, modelo, categoria.definicoes);
  }

  const nome = tentar('nome', () => normalizarNomeDeAtivo(preenchido.nome));
  const fabricante = tentar('fabricante', () =>
    normalizarTextoDoAtivo('fabricante', preenchido.fabricante),
  );
  const modeloDoFabricante = tentar('modelo_do_fabricante', () =>
    normalizarTextoDoAtivo('modelo', preenchido.modelo),
  );
  const numeroSerie = tentar('numero_serie', () =>
    normalizarTextoDoAtivo('numero_serie', opcional('numero_serie')),
  );
  const data = (c: 'data_compra' | 'garantia_ate') =>
    tentar(c, () => {
      const v = opcional(c);
      if (v === null) return null;
      return lerDataDaPlanilha(v) ?? recusa('ativo_data_invalida', { campo: c });
    });
  const dataCompra = data('data_compra');
  const garantiaAte = data('garantia_ate');
  const datas =
    dataCompra === undefined || garantiaAte === undefined
      ? undefined
      : tentar('garantia_ate', () => validarDatasDoAtivo({ dataCompra, garantiaAte }));
  const criticidade = tentar('criticidade', () => {
    const v = opcional('criticidade');
    if (v === null) return null;
    return validarCriticidade(/^\d+$/.test(v) ? Number(v) : Number.NaN);
  });
  const campos =
    categoria === undefined
      ? undefined
      : tentar(null, () => validarCamposDoAtivo(categoria ?? null, null, preenchido.campos));

  const chave =
    local && nome !== undefined && categoria !== undefined && numeroSerie !== undefined
      ? chaveDeImportacao({
          localId: local.id,
          categoriaId: categoria?.id ?? null,
          nome,
          numeroSerie,
        })
      : null;
  const completo =
    erros.length === 0 &&
    local &&
    nome !== undefined &&
    fabricante !== undefined &&
    modeloDoFabricante !== undefined &&
    numeroSerie !== undefined &&
    datas !== undefined &&
    criticidade !== undefined &&
    campos !== undefined &&
    modelo !== undefined &&
    chave !== null;
  return {
    numero: linha.numero,
    nome: nome ?? (preenchido.nome.trim() || null),
    erros,
    chave,
    ativo: completo
      ? {
          localId: local.id,
          chaveImportacao: chave,
          categoriaId: categoria?.id ?? null,
          modeloId: modelo?.id ?? null,
          nome,
          fabricante,
          modelo: modeloDoFabricante,
          numeroSerie,
          dataCompra: datas.dataCompra,
          garantiaAte: datas.garantiaAte,
          criticidade,
          campos,
        }
      : null,
  };
}

/**
 * Analisa a planilha inteira contra as referências do hotel, sem gravar: a
 * prévia mostra isto, e a gravação cria só as linhas novas.
 */
export function analisarImportacao(
  texto: string,
  refs: ReferenciasDaImportacao,
): ResultadoDaImportacao {
  const csv = lerCsv(texto);
  const chavesDeCampo = new Set(refs.categorias.flatMap((c) => c.definicoes.map((d) => d.chave)));
  const colunas = lerCabecalho(csv.cabecalho, chavesDeCampo);
  const vistas = new Map<string, number>();
  const linhas = csv.linhas.map((l): LinhaAnalisada => {
    const { chave, ...analisada } = analisarLinha(l, colunas, refs);
    if (chave !== null) {
      const anterior = vistas.get(chave);
      if (anterior !== undefined) {
        return {
          ...analisada,
          situacao: 'invalida',
          ativo: null,
          erros: [
            ...analisada.erros,
            { codigo: 'importacao_linha_repetida', coluna: null, parametros: { linha: anterior } },
          ],
        };
      }
      vistas.set(chave, l.numero);
    }
    if (analisada.ativo === null) return { ...analisada, situacao: 'invalida' };
    if (chave !== null && refs.chavesExistentes.has(chave)) {
      return { ...analisada, situacao: 'ja_importada', ativo: null };
    }
    return { ...analisada, situacao: 'nova' };
  });
  return {
    linhas,
    novas: linhas.filter((l) => l.situacao === 'nova').length,
    jaImportadas: linhas.filter((l) => l.situacao === 'ja_importada').length,
    invalidas: linhas.filter((l) => l.situacao === 'invalida').length,
  };
}
