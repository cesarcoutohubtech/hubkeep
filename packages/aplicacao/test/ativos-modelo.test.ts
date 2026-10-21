// O modelo escolhido no cadastro do ativo (M1), com portas em memória: o
// modelo ativo e da categoria do ativo entra; desativado ou de outra
// categoria recusa; na alteração, o ausente mantém o gravado, o modelo que o
// ativo já tinha continua valendo desativado (e de outra bandeira), e trocar
// a categoria sem trocar o modelo recusa. O modelo novo de outra bandeira que
// a do hotel recusa (PB1b). O código da etiqueta reservada (M3) entra só
// reservado no hotel e livre.
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
  ar: { id: 'm-ar', categoriaId: 'cat-ar', ativa: true, bandeiraId: null },
  velho: { id: 'm-velho', categoriaId: 'cat-ar', ativa: false, bandeiraId: 'b-outra' },
  porta: { id: 'm-porta', categoriaId: 'cat-porta', ativa: true, bandeiraId: null },
  daBandeira: { id: 'm-dela', categoriaId: 'cat-ar', ativa: true, bandeiraId: 'b-1' },
  deOutra: { id: 'm-outra', categoriaId: 'cat-ar', ativa: true, bandeiraId: 'b-outra' },
};

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

const RESERVAS: Record<string, { hotelId: string; ligado: boolean }> = {
  '7K3M9QX2AB': { hotelId: HOTEL, ligado: false },
  '7K3M9QX2AC': { hotelId: HOTEL, ligado: true },
  '7K3M9QX2AD': { hotelId: 'h-2', ligado: false },
};

function montar(gravado?: Partial<AtivoGravado>) {
  const gravacoes: DadosDeAtivo[] = [];
  const codigos: (string | undefined)[] = [];
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
      hotel: async () => ({ id: HOTEL, bandeiraId: 'b-1' }),
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
      reservaDoCodigo: async (_c, codigo) => RESERVAS[codigo] ?? null,
      criar: async (_c, _h, _l, dados, codigoQr) => {
        gravacoes.push(dados);
        codigos.push(codigoQr);
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
  return { casos, gravacoes, codigos };
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

  it('o modelo do grupo e o da bandeira do hotel entram; o de outra bandeira recusa (PB1b)', async () => {
    const { casos, gravacoes } = montar();
    await casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-dela' });
    expect(gravacoes.map((g) => g.modeloId)).toEqual(['m-dela']);
    expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, modeloId: 'm-outra' }))).toBe(
      'modelo_ativo_de_outra_bandeira',
    );
    expect(
      await codigoDe(casos.alterar(ctx, 'a-1', { ...gravacao, modeloId: 'm-outra', versao: 1 })),
    ).toBe('modelo_ativo_de_outra_bandeira');
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

describe('código da etiqueta reservada no cadastro (M3)', () => {
  it('reservado no hotel e livre: o ativo nasce com ele, como uma pessoa digitaria', async () => {
    const { casos, codigos } = montar();
    await casos.cadastrar(ctx, { ...CADASTRO, codigoQr: '7k3m9-qx2ab' });
    await casos.cadastrar(ctx, { ...CADASTRO, codigoQr: null });
    await casos.cadastrar(ctx, CADASTRO);
    expect(codigos).toEqual(['7K3M9QX2AB', undefined, undefined]);
  });

  it('sem reserva, de outro hotel ou mal formado: qr_nao_reservado; ligado: qr_ja_ligado', async () => {
    const { casos, codigos } = montar();
    for (const codigoQr of ['7K3M9QX2AZ', '7K3M9QX2AD', 'x']) {
      expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, codigoQr }))).toBe(
        'qr_nao_reservado',
      );
    }
    expect(await codigoDe(casos.cadastrar(ctx, { ...CADASTRO, codigoQr: '7K3M9QX2AC' }))).toBe(
      'qr_ja_ligado',
    );
    expect(codigos).toEqual([]);
  });
});
