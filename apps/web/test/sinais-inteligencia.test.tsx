// As reclamações de hóspede no Intelligence (ADR-047): a leitura do CSV no
// navegador (o separador, as aspas, as colunas fora do modelo, os limites e
// as partes do envio), a soma das partes com a linha do arquivo, a UH
// sugerida, e a fila, o formulário e o resultado renderizados no servidor
// (react-dom/server), sem rede, nos quatro idiomas e no pseudo-idioma, sem
// chave crua.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CABECALHO_DO_MODELO,
  lerCsvDeSinais,
  partesDaImportacao,
  separadorDoCabecalho,
} from '../src/app/(painel)/inteligencia/sinais/csv';
import {
  type Apoio,
  FormularioDeChamado,
  FormularioDeClassificacao,
  LeituraDoArquivo,
  ResultadoDaImportacao,
  TabelaDeSinais,
  podeAbrirChamado,
  somarPartes,
  uhSugerida,
} from '../src/app/(painel)/inteligencia/sinais/tela';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const H1 = '11111111-1111-4111-8111-111111111111';
const S1 = '22222222-2222-4222-8222-222222222221';
const S2 = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const U = '44444444-4444-4444-8444-444444444444';
const CAT = '55555555-5555-4555-8555-555555555555';
const UH = '66666666-6666-4666-8666-666666666666';

const IDIOMAS_DO_TESTE: IdiomaDeExibicao[] = [...IDIOMAS, PSEUDO_IDIOMA];
const renderizar = (idioma: IdiomaDeExibicao, tela: ReactNode) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      {tela}
    </ProvedorDeIdioma>,
  );
const nada = () => undefined;

describe('a leitura do CSV', () => {
  it('vírgula, aspas com separador, aspas dobradas e quebra de linha, e a linha de cada registro', () => {
    const texto =
      '﻿id_externo,data,fonte,nota,escala,texto\r\n' +
      'r-1,2026-10-10,Google,4,5,"Ar ruim, barulhento"\r\n' +
      '\r\n' +
      'r-2,2026-10-11,google,,,"Disse ""nunca mais""\nde novo"\r\n' +
      'r-3,2026-10-12,google,2,5,Chuveiro\r\n';
    const l = lerCsvDeSinais(texto);
    expect(l).toEqual({
      ok: true,
      linhas: [
        {
          id_externo: 'r-1',
          data: '2026-10-10',
          fonte: 'Google',
          nota: '4',
          escala: '5',
          texto: 'Ar ruim, barulhento',
        },
        {
          id_externo: 'r-2',
          data: '2026-10-11',
          fonte: 'google',
          nota: '',
          escala: '',
          texto: 'Disse "nunca mais"\nde novo',
        },
        {
          id_externo: 'r-3',
          data: '2026-10-12',
          fonte: 'google',
          nota: '2',
          escala: '5',
          texto: 'Chuveiro',
        },
      ],
      linhasNoArquivo: [2, 4, 6],
      ignoradas: [],
    });
  });

  it('ponto e vírgula, cabeçalho em maiúsculas e as colunas fora do modelo ficam de fora', () => {
    const l = lerCsvDeSinais(
      'ID_EXTERNO;Data;Fonte;Nome do hóspede;texto\nr-1;2026-10-10;tripadvisor;Ana Souza;Ar quente\n',
    );
    expect(separadorDoCabecalho('a;b;c,d')).toBe(';');
    expect(l).toMatchObject({
      ok: true,
      linhas: [{ id_externo: 'r-1', data: '2026-10-10', fonte: 'tripadvisor', texto: 'Ar quente' }],
      ignoradas: ['Nome do hóspede'],
    });
    expect(JSON.stringify(l)).not.toContain('Ana Souza');
  });

  it('sem linhas, sem as colunas obrigatórias ou acima do limite, o arquivo não serve', () => {
    expect(lerCsvDeSinais('id_externo,data,fonte\n')).toEqual({ ok: false, erro: 'sem_linhas' });
    expect(lerCsvDeSinais('')).toEqual({ ok: false, erro: 'sem_linhas' });
    expect(lerCsvDeSinais('id_externo,texto\nr-1,Ar\n')).toEqual({
      ok: false,
      erro: 'colunas_faltando',
      faltando: ['data', 'fonte'],
    });
    const muitas = `${CABECALHO_DO_MODELO}\n${'r,2026-10-10,g,,,x,,\n'.repeat(1001)}`;
    expect(lerCsvDeSinais(muitas)).toEqual({ ok: false, erro: 'muitas_linhas', limite: 1000 });
  });

  it('as partes ficam abaixo do limite de bytes, na ordem', () => {
    const linhas = Array.from({ length: 10 }, (_, i) => ({
      id_externo: `r-${i}`,
      texto: 'x'.repeat(100),
    }));
    const partes = partesDaImportacao(linhas, 400);
    expect(partes.flat()).toEqual(linhas);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes)
      expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(400);
    expect(partesDaImportacao(linhas)).toHaveLength(1);
  });
});

describe('a soma das partes e a UH sugerida', () => {
  it('o erro volta com a linha do arquivo', () => {
    const r = somarPartes(
      [
        {
          loteId: null,
          entraram: 1,
          repetidas: 0,
          erros: 1,
          linhas: [
            { linha: 1, resultado: 'entrou' },
            { linha: 2, resultado: 'erro', erro: 'data_invalida' },
          ],
        },
        {
          loteId: null,
          entraram: 0,
          repetidas: 1,
          erros: 1,
          linhas: [
            { linha: 1, resultado: 'erro', erro: 'sem_conteudo' },
            { linha: 2, resultado: 'repetida' },
          ],
        },
      ],
      [
        [2, 3],
        [5, 6],
      ],
    );
    expect(r).toEqual({
      entraram: 1,
      repetidas: 1,
      erros: [
        { linhaNoArquivo: 3, erro: 'data_invalida' },
        { linhaNoArquivo: 5, erro: 'sem_conteudo' },
      ],
    });
  });

  it('a UH com o mesmo nome ou número, só quando uma só bate', () => {
    const uh = (id: string, nome: string) => ({
      id,
      nome,
      tipo: 'uh' as const,
      andar: null,
      edificacao: null,
      status: 'ativo' as const,
      origem: 'sistema_hoteleiro' as const,
      editavel: false,
    });
    const uhs = [uh('a', 'UH 304'), uh('b', '305'), uh('c', 'Torre B 305')];
    expect(uhSugerida(uhs, '304')).toBe('a');
    expect(uhSugerida(uhs, 'uh 304')).toBe('a');
    expect(uhSugerida(uhs, '305')).toBeNull();
    expect(uhSugerida(uhs, null)).toBeNull();
  });
});

const sinal = {
  id: S1,
  hotelId: H1,
  fonte: 'google',
  idExterno: 'r-1',
  ocorridoEm: '2026-10-10T12:00:00.000Z',
  nota: 2.5,
  escala: 5,
  texto: 'Ar condicionado do 304 muito barulhento',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: '304',
  manutencao: null,
  categoriaId: null,
  uhId: null,
  ativoId: null,
  ligacao: 'sem_ligacao' as const,
  classificadoEm: null,
  classificadoPor: null,
  importadoEm: '2026-10-11T09:00:00.000Z',
  versao: 1,
  chamadoId: null as string | null,
};
const classificado = {
  ...sinal,
  id: S2,
  idExterno: 'r-2',
  texto: null,
  textoApagadoEm: '2026-10-15T03:00:00.000Z',
  manutencao: true,
  categoriaId: CAT,
  uhId: UH,
  ativoId: A,
  ligacao: 'confirmada' as const,
  classificadoEm: '2026-10-12T10:00:00.000Z',
  classificadoPor: U,
  versao: 2,
};
const fila = {
  sinais: [sinal, classificado],
  limitada: false,
  nomes: { ativos: { [A]: 'Split UH 304' }, pessoas: { [U]: 'Marina' } },
};
const apoio: Apoio = {
  categorias: [
    { id: CAT, chavePadrao: null, nomes: { 'pt-BR': 'Ar-condicionado' }, campos: [], ativa: true },
  ],
  idiomaPadrao: 'pt-BR',
  uhs: [
    {
      id: UH,
      nome: 'UH 304',
      tipo: 'uh',
      andar: '3',
      edificacao: null,
      status: 'ativo',
      origem: 'sistema_hoteleiro',
      editavel: false,
    },
  ],
};
const resultado = {
  entraram: 3,
  repetidas: 1,
  erros: [{ linhaNoArquivo: 4, erro: 'data_invalida' }],
};

describe('as telas das reclamações em todos os idiomas, sem chave crua', () => {
  it.each(IDIOMAS_DO_TESTE)('%s', (idioma) => {
    const html = [
      renderizar(
        idioma,
        <TabelaDeSinais fila={fila} apoio={apoio} aoEditar={nada} aoAbrirChamado={nada} />,
      ),
      renderizar(
        idioma,
        <FormularioDeClassificacao
          sinal={classificado}
          apoio={apoio}
          nomeDoAtivo="Split UH 304"
          aoCancelar={nada}
          aoSalvar={nada}
        />,
      ),
      renderizar(
        idioma,
        <FormularioDeClassificacao
          sinal={sinal}
          apoio={apoio}
          nomeDoAtivo={undefined}
          aoCancelar={nada}
          aoSalvar={nada}
        />,
      ),
      renderizar(
        idioma,
        <FormularioDeChamado
          sinal={classificado}
          apoio={apoio}
          nomeDoAtivo="Split UH 304"
          aoCancelar={nada}
          aoAbrir={nada}
        />,
      ),
      renderizar(idioma, <ResultadoDaImportacao resultado={resultado} />),
      renderizar(
        idioma,
        <LeituraDoArquivo
          leitura={{ ok: true, linhas: [{}], linhasNoArquivo: [2], ignoradas: ['nome'] }}
          arquivo="a.csv"
        />,
      ),
      renderizar(
        idioma,
        <LeituraDoArquivo leitura={{ ok: false, erro: 'sem_linhas' }} arquivo="a.csv" />,
      ),
      renderizar(
        idioma,
        <LeituraDoArquivo
          leitura={{ ok: false, erro: 'colunas_faltando', faltando: ['data'] }}
          arquivo="a.csv"
        />,
      ),
      renderizar(
        idioma,
        <LeituraDoArquivo
          leitura={{ ok: false, erro: 'muitas_linhas', limite: 1000 }}
          arquivo="a.csv"
        />,
      ),
    ].join('');
    expect(html).not.toMatch(/inteligencia\.[a-z_]+\.[a-z_]/);
    expect(html).toContain('Split UH 304');
  });
});

describe('a fila e o formulário', () => {
  it('a fila: a nota, o texto, a UH citada, a classificação com o ativo e quem classificou', () => {
    const html = renderizar(
      'pt-BR',
      <TabelaDeSinais fila={fila} apoio={apoio} aoEditar={nada} aoAbrirChamado={nada} />,
    );
    expect(html).toContain('2,5 de 5');
    expect(html).toContain('Ar condicionado do 304 muito barulhento');
    expect(html).toContain('UH citada: 304');
    expect(html).toContain('Sem classificação');
    expect(html).toContain('Ligação confirmada');
    expect(html).toContain('Ar-condicionado');
    expect(html).toContain(`href="/inteligencia/ativos/${A}"`);
    expect(html).toContain('Por Marina em');
    expect(html).toContain('Texto apagado em');
    expect(html).toContain('Classificar');
    expect(html).toContain('Alterar');
  });

  it('sem classificação: só a pergunta, com a UH citada sugerida para depois', () => {
    const html = renderizar(
      'pt-BR',
      <FormularioDeClassificacao
        sinal={sinal}
        apoio={apoio}
        nomeDoAtivo={undefined}
        aoCancelar={nada}
        aoSalvar={nada}
      />,
    );
    expect(html).toContain('É de manutenção?');
    expect(html).not.toContain('Categoria do ativo');
    expect(html).not.toContain('Ligação com o ativo');
  });

  it('classificada com ativo: o ativo, a categoria dele, a UH e a ligação', () => {
    const html = renderizar(
      'pt-BR',
      <FormularioDeClassificacao
        sinal={classificado}
        apoio={apoio}
        nomeDoAtivo="Split UH 304"
        aoCancelar={nada}
        aoSalvar={nada}
      />,
    );
    expect(html).toContain('Tirar o ativo');
    expect(html).toContain('Categoria do ativo');
    expect(html).toContain('Ligação com o ativo');
    expect(html).toMatch(/<option value="confirmada" selected="">Ligação confirmada<\/option>/);
  });

  it('abrir chamado: só a de manutenção com UH ou ativo e sem chamado; com chamado, o link', () => {
    expect(podeAbrirChamado(classificado)).toBe(true);
    expect(podeAbrirChamado(sinal)).toBe(false);
    expect(
      podeAbrirChamado({ ...classificado, uhId: null, ativoId: null, ligacao: 'sem_ligacao' }),
    ).toBe(false);
    const C = '77777777-7777-4777-8777-777777777777';
    const html = renderizar(
      'pt-BR',
      <TabelaDeSinais
        fila={{ ...fila, sinais: [classificado, { ...classificado, id: S1, chamadoId: C }] }}
        apoio={apoio}
        aoEditar={nada}
        aoAbrirChamado={nada}
      />,
    );
    expect(html.match(/Abrir chamado/g)).toHaveLength(1);
    expect(html).toContain(`href="/chamados/${C}"`);
    expect(html).toContain('Ver o chamado');
  });

  it('o formulário do chamado: o ativo, o local, a sugestão sem o texto do hóspede e "afeta hóspede"', () => {
    const html = renderizar(
      'pt-BR',
      <FormularioDeChamado
        sinal={{ ...classificado, texto: 'Texto do hóspede que não vai', textoApagadoEm: null }}
        apoio={apoio}
        nomeDoAtivo="Split UH 304"
        aoCancelar={nada}
        aoAbrir={nada}
      />,
    );
    expect(html).toContain('Com o ativo Split UH 304');
    expect(html).toContain('O chamado abre no local do ativo.');
    expect(html).toMatch(/Reclamação de hóspede, google, [^<]+: Ar-condicionado, UH 304\./);
    expect(html).not.toContain('Texto do hóspede que não vai');
    expect(html).toContain('afeta hóspede');
  });

  it('o resultado da importação: as contagens e a linha do arquivo com o motivo', () => {
    const html = renderizar('pt-BR', <ResultadoDaImportacao resultado={resultado} />);
    expect(html).toContain('3 reclamações entraram; 1 já existia; 1 linha com erro.');
    expect(html).toContain('Data fora do formato');
  });
});
