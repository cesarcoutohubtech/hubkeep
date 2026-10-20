// Importação de ativos por planilha (M2), com portas em memória: só o
// Implantador e a gestão do hotel importam; a prévia não grava; a gravação
// cria só as linhas novas, com a chave; a chave gravada por outro envio volta
// como já importada; a regra recusada na gravação fica na linha e o resto
// segue; e a categoria padrão se acha pelo nome do catálogo.
import {
  type AtivoDaImportacao,
  type Atribuicao,
  type Contexto,
  RegraViolada,
} from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { criarCasosDeUsoDeImportacaoDeAtivos, nomesDaCategoria } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const HOTEL = { id: 'h-1', bandeiraId: null };
const papel = (p: Atribuicao['papel']): Atribuicao => ({
  id: 'a',
  usuarioId: 'u',
  papel: p,
  escopo: { tipo: 'hotel', hotelId: HOTEL.id },
  validoAte: null,
  revogadoEm: null,
});
const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(
  minhas: Atribuicao[] = [papel('implantador')],
  criar?: (a: AtivoDaImportacao) => { id: string } | 'ja_importada',
) {
  const criados: AtivoDaImportacao[] = [];
  const casos = criarCasosDeUsoDeImportacaoDeAtivos({
    importacao: {
      hotel: async (_c, id) => (id === HOTEL.id ? HOTEL : null),
      locais: async () => [
        { id: 'l-1', nome: 'Casa de máquinas', edificacao: null, status: 'ativo' },
      ],
      categorias: async () => [
        { id: 'c-ar', ativa: true, campos: [], nomes: {}, chavePadrao: 'refrigeracao' },
      ],
      modelos: async () => [],
      chaves: async () => [],
      criar: async (_c, _h, a) => {
        const r = criar ? criar(a) : { id: `novo-${criados.length + 1}` };
        if (r !== 'ja_importada') criados.push(a);
        return r;
      },
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => new Date('2026-10-20T12:00:00Z') },
  });
  return { casos, criados };
}

const CSV = 'local;nome;categoria\nCasa de máquinas;Split 1;\nCasa de máquinas;Split 2;\nSala;X;';

describe('importação de ativos (M2)', () => {
  it('a prévia analisa sem gravar', async () => {
    const { casos, criados } = montar();
    const r = await casos.prever(ctx, HOTEL.id, CSV);
    expect(r).toMatchObject({ novas: 2, jaImportadas: 0, invalidas: 1 });
    expect(criados).toEqual([]);
  });

  it('a gravação cria só as linhas novas, com a chave', async () => {
    const { casos, criados } = montar();
    const r = await casos.importar(ctx, HOTEL.id, CSV);
    expect(r).toMatchObject({ criadas: 2, jaImportadas: 0, invalidas: 1 });
    expect(r.linhas.map((l) => [l.numero, l.situacao, l.ativoId])).toEqual([
      [2, 'criada', 'novo-1'],
      [3, 'criada', 'novo-2'],
      [4, 'invalida', null],
    ]);
    expect(criados.map((a) => a.chaveImportacao)).toEqual([
      expect.stringMatching(/^v1:[0-9a-f]{64}$/),
      expect.stringMatching(/^v1:[0-9a-f]{64}$/),
    ]);
  });

  it('a chave gravada por outro envio volta como já importada', async () => {
    const { casos } = montar(undefined, () => 'ja_importada');
    const r = await casos.importar(ctx, HOTEL.id, CSV);
    expect(r).toMatchObject({ criadas: 0, jaImportadas: 2, invalidas: 1 });
  });

  it('a regra recusada na gravação fica na linha, e o resto segue', async () => {
    let n = 0;
    const { casos } = montar(undefined, () => {
      n++;
      if (n === 1) throw new RegraViolada('ativo_local_inativo', 'O local está desativado.');
      return { id: 'novo' };
    });
    const r = await casos.importar(ctx, HOTEL.id, CSV);
    expect(r.linhas.map((l) => [l.situacao, l.erros.map((e) => e.codigo)])).toEqual([
      ['invalida', ['ativo_local_inativo']],
      ['criada', []],
      ['invalida', ['importacao_local_nao_encontrado']],
    ]);
  });

  it('o Técnico não importa; hotel invisível dá 404', async () => {
    expect(await codigoDe(montar([papel('tecnico')]).casos.prever(ctx, HOTEL.id, CSV))).toBe(
      'importacao_fora_do_escopo',
    );
    expect(await codigoDe(montar().casos.prever(ctx, 'outro', CSV))).toBe('hotel_nao_encontrado');
  });

  it('a categoria padrão se acha pelo nome do catálogo em qualquer idioma', async () => {
    const nomes = nomesDaCategoria({ nomes: { en: 'AC' }, chavePadrao: 'refrigeracao' });
    expect(nomes).toContain('AC');
    expect(nomes.length).toBeGreaterThan(2);
    const { casos } = montar();
    const r = await casos.prever(
      ctx,
      HOTEL.id,
      `local;nome;categoria\nCasa de máquinas;S;${nomes[1]}`,
    );
    expect(r.linhas[0]?.ativo?.categoriaId).toBe('c-ar');
  });
});
