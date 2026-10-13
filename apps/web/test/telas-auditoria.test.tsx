// Auditoria geral (fase 1c): a tela nos quatro idiomas e no pseudo-idioma, com
// os filtros e os nomes dos tipos de registro do catálogo; e o CSV gerado no
// navegador (BOM, separador, aspas e a proteção contra fórmula na planilha).
// Renderiza no servidor (react-dom/server), sem rede: a lista vem depois da
// consulta, que não roda aqui.
import { IDIOMAS, type IdiomaDeExibicao, PSEUDO_IDIOMA, mensagensDe } from '@hubkeep/i18n';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AuditoriaGeral from '../src/app/(painel)/admin/auditoria/page';
import { BOM, arquivoCsv, campoDeCsv } from '../src/cliente/csv';
import { ProvedorDeIdioma } from '../src/i18n/cliente';

const renderizar = (idioma: IdiomaDeExibicao) =>
  renderToString(
    <ProvedorDeIdioma idioma={idioma} mensagens={mensagensDe(idioma)} pseudoLiberado>
      <AuditoriaGeral />
    </ProvedorDeIdioma>,
  );

describe('tela da auditoria geral', () => {
  it.each([
    ['pt-BR', 'Tipo de registro', 'Credencial do conector', 'Até 92 dias por consulta.'],
    ['en', 'Record type', 'Connector credential', 'Up to 92 days per query.'],
    ['es', 'Tipo de registro', 'Credencial del conector', 'Hasta 92 días por consulta.'],
    ['fr', 'Type d’enregistrement', 'Identifiant du connecteur', 'Jusqu’à 92 jours par recherche.'],
  ] as const)('%s: filtros e tipos de registro do catálogo', (idioma, filtro, entidade, dica) => {
    const html = renderizar(idioma);
    expect(html).toContain(filtro);
    expect(html).toContain(entidade);
    expect(html).toContain(dica);
  });

  it('todos os idiomas renderizam, e o pseudo-idioma marca todo texto', () => {
    for (const idioma of IDIOMAS) expect(renderizar(idioma)).not.toContain('admin.auditoria.');
    expect(renderizar(PSEUDO_IDIOMA)).toMatch(/\[[^\]]+\]/);
  });
});

describe('CSV no navegador', () => {
  it('aspas, separador e quebra de linha', () => {
    expect(campoDeCsv('simples', ';')).toBe('simples');
    expect(campoDeCsv('a;b', ';')).toBe('"a;b"');
    expect(campoDeCsv('a,b', ';')).toBe('a,b');
    expect(campoDeCsv('a,b', ',')).toBe('"a,b"');
    expect(campoDeCsv('diz "oi"', ';')).toBe('"diz ""oi"""');
    expect(campoDeCsv('linha 1\nlinha 2', ';')).toBe('"linha 1\nlinha 2"');
  });

  it('o texto que começa como fórmula ganha um apóstrofo', () => {
    for (const v of ['=SOMA(A1)', '+1', '-1', '@x', '\tx'])
      expect(campoDeCsv(v, ';')).toMatch(/^"?'/);
  });

  it('o arquivo: BOM, cabeçalho e linhas em CRLF', () => {
    expect(
      arquivoCsv(
        [
          ['Quando', 'Ação'],
          ['13/10/2026', 'Chamado aberto'],
        ],
        ';',
      ),
    ).toBe(`${BOM}Quando;Ação\r\n13/10/2026;Chamado aberto\r\n`);
  });
});
