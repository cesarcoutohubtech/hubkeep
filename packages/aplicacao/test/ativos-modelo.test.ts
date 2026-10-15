// O modelo escolhido no cadastro do ativo (M1), com portas em memória: o
// modelo ativo e da categoria do ativo entra; desativado ou de outra
// categoria recusa; na alteração, o ausente mantém o gravado, o modelo que o
// ativo já tinha continua valendo desativado, e trocar a categoria sem trocar
// o modelo recusa.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import { type AtivoGravado, type DadosDeAtivo, criarCasosDeUsoDeAtivos } from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const HOTEL = 'h-1';
const atr: Atribuicao = {
  id: 'a',
  usuarioId: 'u',
  papel: 'tecnico',
  escopo: { tipo: 'hotel', hotelId: HOTEL },
  validoAte: null,
  revogadoEm: null,
};

const MODELOS = {
  ar: { id: 'm-ar', categoriaId: 'cat-ar', ativa: true },
  velho: { id: 'm-velho', categoriaId: 'cat-ar', ativa: false },
  porta: { id: 'm-porta', categoriaId: 'cat-porta', ativa: true },
};

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(gravado?: Partial<AtivoGravado>) {
  const gravacoes: DadosDeAtivo[] = [];
  const ativo: AtivoGravado = {
    id: 'a-1',
    hotelId: HOTEL,
    localId: 'l-1',
    categoriaId: 'cat-ar',
    modeloId: 'm-velho',
    nome: 'Split',
    fabricante: null,
    modelo: null,
    numeroSerie: null,
    dataCompra: null,
    garantiaAte: null,
    criticidade: null,
    campos: {},
    versao: 1,
    desativadoEm: null,
    codigoQr: '0000000001',
    ...gravado,
  };
  const casos = criarCasosDeUsoDeAtivos({
    ativos: {
      hotel: async () => ({ id: HOTEL, bandeiraId: null }),
      local: async () => ({ id: 'l-1', hotelId: HOTEL, status: 'ativo' }),
      politica: async () => ({}),
      categorias: async () => [
        { id: 'cat-ar', ativa: true, campos: [] },
        { id: 'cat-porta', ativa: true, campos: [] },
      ],
      modelo: async (_c, id) => Object.values(MODELOS).find((m) => m.id === id) ?? null,
      ativos: async () => [],
      ativo: async () => ativo,
      ativoPorCodigoQr: async () => null,
      criar: async (_c, _h, _l, dados) => {
        gravacoes.push(dados);
        return { id: 'novo', versao: 1 };
      },
      alterar: async (_c, _id, versao, mudanca) => {
        if (!('desativado' in mudanca)) gravacoes.push(mudanca);
        return { versao: versao + 1 };
      },
      mover: async () => ({ versao: 2 }),
      movimentacoes: async () => [],
    },
    atribuicoes: { doUsuario: async () => [atr], doMembro: async () => [] } as never,
    relogio: { agora: () => new Date('2026-10-15T12:00:00Z') },
  });
  return { casos, gravacoes };
}

const gravacao = {
  categoriaId: 'cat-ar',
  nome: 'Split UH 101',
  fabricante: null,
  modelo: null,
  numeroSerie: null,
};
const CADASTRO = { localId: 'l-1', ...gravacao };

describe('modelo no cadastro do ativo (M1)', () => {
  it('modelo ativo e da categoria entra; sem modelo, nulo', async () => {
    const { casos, gravacoes } = montar();
    await casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-ar' });
    await casos.cadastrar(ctx, CADASTRO);
    expect(gravacoes.map((g) => g.modeloId)).toEqual(['m-ar', null]);
  });

  it('desativado, de outra categoria ou inexistente recusa', async () => {
    const { casos } = montar();
    expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-velho' }))).toBe(
      'modelo_ativo_inativo',
    );
    expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-porta' }))).toBe(
      'modelo_ativo_de_outra_categoria',
    );
    expect(
      await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, categoriaId: null, modeloId: 'm-ar' })),
    ).toBe('modelo_ativo_de_outra_categoria');
    expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-nao' }))).toBe(
      'modelo_ativo_nao_encontrado',
    );
  });

  it('na alteração, ausente mantém o gravado, mesmo desativado; null tira', async () => {
    const { casos, gravacoes } = montar();
    await casos.alterar(ctx, 'a-1', { ...gravacao, versao: 1 });
    await casos.alterar(ctx, 'a-1', { ...gravacao, versao: 1, modeloId: null });
    expect(gravacoes.map((g) => g.modeloId)).toEqual(['m-velho', null]);
  });

  it('trocar a categoria sem trocar o modelo recusa', async () => {
    const { casos } = montar({ modeloId: 'm-ar' });
    expect(
      await codigoDe(
        casos.alterar(ctx, 'a-1', { ...gravacao, categoriaId: 'cat-porta', versao: 1 }),
      ),
    ).toBe('modelo_ativo_de_outra_categoria');
  });
});
