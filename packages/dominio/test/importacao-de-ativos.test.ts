// Importação de ativos por planilha (M2; decisões 18 e 19 do Cesar, de
// 19/10/2026): o leitor de CSV, o cabeçalho, a leitura das células, a chave
// de importação e a análise linha a linha contra as referências do hotel.
import { describe, expect, it } from 'vitest';
import {
  type CategoriaDaImportacao,
  type DefinicaoDeCampo,
  LIMITES_DA_IMPORTACAO,
  type ReferenciasDaImportacao,
  analisarImportacao,
  chaveDeImportacao,
  lerCabecalho,
  lerCsv,
  lerDataDaPlanilha,
  lerValorDaPlanilha,
  modeloDaPlanilha,
  sha256,
  tamanhoUtf8,
} from '../src/index';

const codigo = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as { codigo?: string }).codigo;
  }
  return undefined;
};

const campo = (d: Partial<DefinicaoDeCampo> & Pick<DefinicaoDeCampo, 'chave' | 'tipo'>) =>
  ({ obrigatorio: false, rotulos: {}, unidade: null, opcoes: [], ...d }) as DefinicaoDeCampo;

const AR: CategoriaDaImportacao = {
  id: 'cat-ar',
  ativa: true,
  nomes: ['Ar-condicionado', 'Air conditioner'],
  definicoes: [
    campo({ chave: 'btu', tipo: 'numero', obrigatorio: true }),
    campo({
      chave: 'gas',
      tipo: 'lista',
      opcoes: [{ chave: 'r410a', rotulos: { 'pt-BR': 'R-410A' } }],
    }),
    campo({ chave: 'inverter', tipo: 'sim_nao' }),
  ],
};
const BOMBA: CategoriaDaImportacao = {
  id: 'cat-bomba',
  ativa: true,
  nomes: ['Bomba'],
  definicoes: [campo({ chave: 'vazao', tipo: 'numero' })],
};
const REFS: ReferenciasDaImportacao = {
  locais: [
    { id: 'l-101', nome: 'Apto 101', edificacao: 'Torre A', status: 'ativo' },
    { id: 'l-101b', nome: 'Apto 101', edificacao: 'Torre B', status: 'ativo' },
    { id: 'l-casa', nome: 'Casa de máquinas', edificacao: null, status: 'ativo' },
    { id: 'l-velho', nome: 'Depósito velho', edificacao: null, status: 'inativo' },
  ],
  categorias: [AR, BOMBA],
  modelos: [
    {
      id: 'm-split',
      categoriaId: 'cat-ar',
      nome: 'Split 12k',
      ativa: true,
      fabricante: 'Fab',
      modelo: 'S12',
      campos: { btu: 12000 },
    },
    {
      id: 'm-velho',
      categoriaId: 'cat-ar',
      nome: 'Janela',
      ativa: false,
      fabricante: null,
      modelo: null,
      campos: {},
    },
  ],
  chavesExistentes: new Set(),
};

const CAB =
  'local;edificacao;categoria;modelo;nome;numero_serie;campo.btu;campo.gas;campo.inverter';

describe('SHA-256 e tamanho em UTF-8', () => {
  it('bate com os vetores do FIPS 180-4', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256('ação')).toBe(sha256('ação'));
  });
  it('conta bytes de cada faixa', () => {
    expect(tamanhoUtf8('a')).toBe(1);
    expect(tamanhoUtf8('ã')).toBe(2);
    expect(tamanhoUtf8('€')).toBe(3);
    expect(tamanhoUtf8('😀')).toBe(4);
  });
});

describe('lerCsv', () => {
  it('lê ponto e vírgula, aspas, aspa dobrada e quebra de linha dentro de aspas', () => {
    const csv = lerCsv('﻿a;b\r\n"x;1";"diz ""oi"""\r\n\r\n"linha\num";2\n');
    expect(csv.separador).toBe(';');
    expect(csv.cabecalho).toEqual(['a', 'b']);
    expect(csv.linhas).toEqual([
      { numero: 2, celulas: ['x;1', 'diz "oi"'] },
      { numero: 4, celulas: ['linha\num', '2'] },
    ]);
  });
  it('tira o separador do cabeçalho: vírgula', () => {
    const csv = lerCsv('a,b\n1,2');
    expect(csv.separador).toBe(',');
    expect(csv.linhas[0]?.celulas).toEqual(['1', '2']);
  });
  it('recusa aspas sem fechar, com a linha', () => {
    expect(codigo(() => lerCsv('a;b\n1;"2\n3'))).toBe('importacao_csv_invalido');
  });
  it('recusa a planilha sem linhas', () => {
    expect(codigo(() => lerCsv('a;b\n\n'))).toBe('importacao_vazia');
    expect(codigo(() => lerCsv(''))).toBe('importacao_vazia');
  });
  it('recusa acima do limite de linhas', () => {
    const texto = `a\n${'x\n'.repeat(LIMITES_DA_IMPORTACAO.linhas + 1)}`;
    expect(codigo(() => lerCsv(texto))).toBe('importacao_limite');
    expect(lerCsv(`a\n${'x\n'.repeat(LIMITES_DA_IMPORTACAO.linhas)}`).linhas).toHaveLength(2000);
  });
  it('recusa acima do limite de bytes', () => {
    expect(codigo(() => lerCsv('a\n' + 'x'.repeat(LIMITES_DA_IMPORTACAO.bytes)))).toBe(
      'importacao_limite',
    );
  });
});

describe('lerCabecalho', () => {
  const chaves = new Set(['btu']);
  it('acha as colunas fixas e as de campo, sem caixa', () => {
    const c = lerCabecalho([' Local ', 'NOME', 'campo.btu'], chaves);
    expect(c.fixas).toEqual({ local: 0, nome: 1 });
    expect([...c.campos]).toEqual([['btu', 2]]);
    expect(c.total).toBe(3);
  });
  it('recusa coluna fora do modelo, repetida ou faltando', () => {
    expect(codigo(() => lerCabecalho(['local', 'nome', 'cor'], chaves))).toBe(
      'importacao_coluna_desconhecida',
    );
    expect(codigo(() => lerCabecalho(['local', 'nome', 'campo.cor'], chaves))).toBe(
      'importacao_coluna_desconhecida',
    );
    expect(codigo(() => lerCabecalho(['local', 'nome', 'Nome'], chaves))).toBe(
      'importacao_coluna_repetida',
    );
    expect(codigo(() => lerCabecalho(['local'], chaves))).toBe('importacao_coluna_obrigatoria');
  });
});

describe('modelo da planilha', () => {
  it('tem o BOM, as colunas fixas e um campo por chave, sem repetir', () => {
    expect(modeloDaPlanilha([AR, BOMBA, AR])).toBe(
      '﻿local;edificacao;categoria;modelo;nome;fabricante;modelo_do_fabricante;numero_serie;data_compra;garantia_ate;criticidade;campo.btu;campo.gas;campo.inverter;campo.vazao\r\n',
    );
  });
});

describe('leitura das células', () => {
  it('datas em aaaa-mm-dd e dd/mm/aaaa, só as que existem', () => {
    expect(lerDataDaPlanilha('2026-10-20')).toBe('2026-10-20');
    expect(lerDataDaPlanilha('5/3/2026')).toBe('2026-03-05');
    expect(lerDataDaPlanilha('30/02/2026')).toBeUndefined();
    expect(lerDataDaPlanilha('03-05-2026')).toBeUndefined();
  });
  it('número com ponto ou vírgula, sim e não em quatro idiomas, opção pela chave ou rótulo', () => {
    const [btu, gas, inverter] = AR.definicoes as [
      DefinicaoDeCampo,
      DefinicaoDeCampo,
      DefinicaoDeCampo,
    ];
    expect(lerValorDaPlanilha(btu, '1,5')).toBe(1.5);
    expect(lerValorDaPlanilha(btu, '12000')).toBe(12000);
    expect(lerValorDaPlanilha(btu, '12.000,0')).toBeUndefined();
    expect(lerValorDaPlanilha(inverter, 'Não')).toBe(false);
    expect(lerValorDaPlanilha(inverter, 'oui')).toBe(true);
    expect(lerValorDaPlanilha(inverter, 'talvez')).toBeUndefined();
    expect(lerValorDaPlanilha(gas, 'r-410a')).toBe('r410a');
    expect(lerValorDaPlanilha(gas, 'R410A')).toBe('r410a');
    expect(lerValorDaPlanilha(gas, 'R22')).toBeUndefined();
  });
});

describe('analisarImportacao', () => {
  it('a linha válida vira ativo novo, com a categoria pelo nome em qualquer idioma', () => {
    const r = analisarImportacao(
      `${CAB}\napto 101;torre a;AIR CONDITIONER;;Split do quarto;SN1;9000;R-410A;sim`,
      REFS,
    );
    expect(r).toMatchObject({ novas: 1, jaImportadas: 0, invalidas: 0 });
    expect(r.linhas[0]).toMatchObject({
      numero: 2,
      situacao: 'nova',
      erros: [],
      ativo: {
        localId: 'l-101',
        categoriaId: 'cat-ar',
        modeloId: null,
        nome: 'Split do quarto',
        numeroSerie: 'SN1',
        campos: { btu: 9000, gas: 'r410a', inverter: true },
      },
    });
    expect(r.linhas[0]?.ativo?.chaveImportacao).toBe(
      chaveDeImportacao({
        localId: 'l-101',
        categoriaId: 'cat-ar',
        nome: 'split do quarto',
        numeroSerie: 'sn1',
      }),
    );
  });

  it('o modelo preenche o que ficou vazio e dá a categoria', () => {
    const r = analisarImportacao(`${CAB}\nCasa de maquinas;;;split 12k;;;;;`, REFS);
    expect(r.linhas[0]).toMatchObject({
      situacao: 'nova',
      ativo: {
        localId: 'l-casa',
        categoriaId: 'cat-ar',
        modeloId: 'm-split',
        nome: 'Split 12k',
        fabricante: 'Fab',
        modelo: 'S12',
        campos: { btu: 12000 },
      },
    });
  });

  it('local que falta, ambíguo ou inativo recusa a linha (decisão 18)', () => {
    const r = analisarImportacao(
      `${CAB}\nApto 999;;;;A;;;;\nApto 101;;;;B;;;;\nDepósito velho;;;;C;;;;`,
      REFS,
    );
    expect(r.invalidas).toBe(3);
    expect(r.linhas.map((l) => l.erros.map((e) => [e.codigo, e.coluna]))).toEqual([
      [['importacao_local_nao_encontrado', 'local']],
      [['importacao_local_ambiguo', 'local']],
      [['ativo_local_inativo', 'local']],
    ]);
    expect(r.linhas[0]?.erros[0]?.parametros).toEqual({ local: 'Apto 999' });
  });

  it('devolve todos os erros da linha, cada um com a coluna', () => {
    const cab = `${CAB};data_compra;garantia_ate;criticidade`;
    const r = analisarImportacao(
      `${cab}\nApto 101;Torre A;Ar-condicionado;;;;muito;R22;sim;31/02/2026;;9`,
      REFS,
    );
    expect(r.linhas[0]?.situacao).toBe('invalida');
    expect(r.linhas[0]?.erros.map((e) => [e.codigo, e.coluna])).toEqual([
      ['valor_de_campo_invalido', 'campo.btu'],
      ['valor_de_campo_invalido', 'campo.gas'],
      ['ativo_nome_invalido', 'nome'],
      ['ativo_data_invalida', 'data_compra'],
      ['ativo_criticidade_invalida', 'criticidade'],
      ['campo_obrigatorio', null],
    ]);
  });

  it('recusa categoria e modelo que não existem, o modelo inativo e o campo de outra categoria', () => {
    const r = analisarImportacao(
      `${CAB};campo.vazao\nApto 101;Torre A;Elevador;;A;;;;;\nApto 101;Torre A;;Janela;B;;;;;\nApto 101;Torre A;Bomba;Split 12k;C;;;;;\nApto 101;Torre A;Bomba;;D;;1;;;3`,
      REFS,
    );
    expect(r.linhas.map((l) => l.erros.map((e) => e.codigo))).toEqual([
      ['importacao_categoria_nao_encontrada'],
      ['modelo_ativo_inativo'],
      ['importacao_modelo_nao_encontrado'],
      ['importacao_campo_de_outra_categoria'],
    ]);
  });

  it('a linha que já entrou volta como já importada; a repetida no arquivo é recusada', () => {
    const linha = 'Apto 101;Torre A;;;Frigobar;F1;;;';
    const primeira = analisarImportacao(`${CAB}\n${linha}`, REFS);
    const chave = primeira.linhas[0]?.ativo?.chaveImportacao ?? '';
    const r = analisarImportacao(`${CAB}\n${linha}\n${linha.replace('Frigobar', ' frigobar ')}`, {
      ...REFS,
      chavesExistentes: new Set([chave]),
    });
    expect(r).toMatchObject({ novas: 0, jaImportadas: 1, invalidas: 1 });
    expect(r.linhas[0]).toMatchObject({ situacao: 'ja_importada', ativo: null });
    expect(r.linhas[1]?.erros).toEqual([
      { codigo: 'importacao_linha_repetida', coluna: null, parametros: { linha: 2 } },
    ]);
  });

  it('célula preenchida depois do cabeçalho recusa a linha; vazia não', () => {
    const r = analisarImportacao('local;nome\nCasa de máquinas;A;;\nCasa de máquinas;B;x', REFS);
    expect(r.linhas.map((l) => l.situacao)).toEqual(['nova', 'invalida']);
    expect(r.linhas[1]?.erros[0]?.codigo).toBe('importacao_celulas_demais');
  });

  it('erros do arquivo inteiro sobem como exceção', () => {
    expect(codigo(() => analisarImportacao('local;nome;campo.cor\nA;B;C', REFS))).toBe(
      'importacao_coluna_desconhecida',
    );
  });
});
