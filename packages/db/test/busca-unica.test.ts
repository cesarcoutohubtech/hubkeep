// Coluna `busca` (B6; ADR-030): calculada só em repositorios/busca.ts, a partir
// dos campos. Sem banco: as funções e uma varredura dos fontes de packages/db.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colunasPesquisaveisDoAtivo,
  colunasPesquisaveisDaUhDoSistema,
  colunasPesquisaveisDoChamado,
  colunasPesquisaveisDoLocal,
} from '../src/repositorios/busca';

const SRC = join(__dirname, '..', 'src');
const fontes = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fontes(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
const trechos = fontes(SRC)
  .map((f) => ({ arquivo: relative(SRC, f).split(sep).join('/'), texto: readFileSync(f, 'utf8') }))
  .filter((f) => f.arquivo !== 'repositorios/busca.ts' && f.arquivo !== 'tipos-banco.ts');

describe('busca calculada num único lugar', () => {
  it('local: o nome e a edificação (I2), sem acento e em minúsculas', () => {
    expect(colunasPesquisaveisDoLocal({ nome: 'Salão de Café', edificacao: null })).toEqual({
      nome: 'Salão de Café',
      edificacao: null,
      busca: 'salao de cafe',
    });
    expect(colunasPesquisaveisDoLocal({ nome: 'UH 101', edificacao: 'Torre Á' })).toEqual({
      nome: 'UH 101',
      edificacao: 'Torre Á',
      busca: 'uh 101 torre a',
    });
  });

  it('UH do sistema hoteleiro: o nome do CM e a edificação gravada na busca, sem gravar a edificação', () => {
    expect(colunasPesquisaveisDaUhDoSistema('UH 101', 'Bloco B')).toEqual({
      nome: 'UH 101',
      busca: 'uh 101 bloco b',
    });
    expect(colunasPesquisaveisDaUhDoSistema('UH 102', null)).toEqual({
      nome: 'UH 102',
      busca: 'uh 102',
    });
  });

  it('ativo: nome, fabricante, modelo e série, pulando os vazios', () => {
    expect(
      colunasPesquisaveisDoAtivo({
        nome: 'Refrigerador',
        fabricante: 'Cônsul',
        modelo: null,
        numeroSerie: 'SN-9',
      }),
    ).toEqual({
      nome: 'Refrigerador',
      fabricante: 'Cônsul',
      modelo: null,
      numero_serie: 'SN-9',
      busca: 'refrigerador consul sn-9',
    });
  });

  it('chamado: a descrição, sem acento e em minúsculas', () => {
    expect(colunasPesquisaveisDoChamado('Ar-condicionado não GELA')).toEqual({
      descricao: 'Ar-condicionado não GELA',
      busca: 'ar-condicionado nao gela',
    });
  });

  it('nenhum outro fonte de packages/db grava a busca ou a normaliza', () => {
    const fora = trechos.filter((f) => /\bbusca\s*:|textoDeBusca/.test(f.texto));
    expect(fora.map((f) => f.arquivo)).toEqual([]);
  });

  it('nenhuma gravação em app.local, app.ativo ou app.chamado escreve um campo pesquisável direto', () => {
    // Do INSERT ou UPDATE até o execute: nome, edificação (I2), fabricante,
    // modelo e número de série só entram pelas colunas de
    // repositorios/busca.ts, que trazem a busca.
    const gravacoes = trechos.flatMap((f) =>
      [
        ...f.texto.matchAll(
          /(insertInto|updateTable)\(\s*'app\.(local|ativo|chamado)'[\s\S]*?\.execute/g,
        ),
      ].map((m) => ({ arquivo: f.arquivo, trecho: m[0] })),
    );
    expect(gravacoes.length).toBeGreaterThanOrEqual(7);
    const diretas = gravacoes.filter((g) =>
      /\b(nome|edificacao|fabricante|modelo|numero_serie|descricao)\s*:/.test(g.trecho),
    );
    expect(diretas.map((g) => g.arquivo)).toEqual([]);
  });
});
