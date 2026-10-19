// Modelos de ativo (M1) com portas em memória: só o Admin gere; a categoria e
// o checklist vêm do que ele enxerga; a leitura filtra os campos pela
// definição atual e a periodicidade gravada fora da regra vira "sem
// sugestão"; a alteração e a desativação levam a versão.
import type { Atribuicao, Contexto } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ModeloDeAtivoGravado,
  type MudancaDeModeloDeAtivo,
  criarCasosDeUsoDeModelosDeAtivo,
} from '../src/index';

const ctx: Contexto = { usuarioId: 'u', tenantId: 't' };
const AGORA = new Date('2026-10-15T12:00:00Z');
const atr = (papel: Atribuicao['papel']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u',
  papel,
  escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h-1' },
  validoAte: null,
  revogadoEm: null,
});

const CAMPOS = [
  {
    chave: 'btus',
    tipo: 'numero',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'BTUs' },
    unidade: null,
    opcoes: [],
  },
];

const codigoDe = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

function montar(minhas: Atribuicao[]) {
  const modelos: ModeloDeAtivoGravado[] = [
    {
      id: 'm1',
      categoriaId: 'cat-ar',
      nome: 'Split 12.000',
      fabricante: null,
      modelo: null,
      campos: { btus: 12000, removido: 'x' },
      checklistModeloId: null,
      planoSugerido: { intervalo: 3, unidade: 'ano' },
      versao: 4,
      ativa: true,
    },
  ];
  const criados: object[] = [];
  const alteracoes: { id: string; versao: number; mudanca: MudancaDeModeloDeAtivo }[] = [];
  const casos = criarCasosDeUsoDeModelosDeAtivo({
    modelos: {
      listar: async () => modelos,
      categorias: async () => [
        { id: 'cat-ar', ativa: true, campos: CAMPOS },
        { id: 'cat-velha', ativa: false, campos: [] },
      ],
      checklists: async () => [
        { id: 'ck-ar', ativa: true, categoriaId: 'cat-ar' },
        { id: 'ck-porta', ativa: true, categoriaId: 'cat-porta' },
      ],
      criar: async (_c, d) => {
        criados.push(d);
        return { id: 'novo' };
      },
      alterar: async (_c, id, versao, mudanca) => {
        alteracoes.push({ id, versao, mudanca });
        return { versao: versao + 1 };
      },
    },
    atribuicoes: { doUsuario: async () => minhas },
    relogio: { agora: () => AGORA },
  });
  return { casos, criados, alteracoes };
}

const PEDIDO = {
  categoriaId: 'cat-ar',
  nome: 'Split 9.000',
  fabricante: 'X',
  modelo: null,
  campos: { btus: 9000 },
  checklistModeloId: 'ck-ar',
  planoSugerido: { intervalo: 6, unidade: 'mes' },
};

describe('modelos de ativo (M1)', () => {
  it('a leitura filtra os campos pela categoria e ignora a periodicidade inválida', async () => {
    const { casos } = montar([atr('tecnico')]);
    const [m] = await casos.listar(ctx);
    expect(m?.campos).toEqual({ btus: 12000 });
    expect(m?.planoSugerido).toBeNull();
  });

  it('o Admin cria com a categoria, o checklist e a periodicidade validados', async () => {
    const { casos, criados } = montar([atr('admin_grupo')]);
    expect(await casos.criar(ctx, PEDIDO)).toEqual({ id: 'novo' });
    expect(criados[0]).toMatchObject({
      categoriaId: 'cat-ar',
      checklistModeloId: 'ck-ar',
      planoSugerido: { intervalo: 6, unidade: 'mes' },
    });
  });

  it('quem não é Admin do grupo não grava', async () => {
    for (const papel of ['gestor_csc', 'gerente_hotel', 'implantador', 'tecnico'] as const) {
      const { casos } = montar([atr(papel)]);
      expect(await codigoDe(casos.criar(ctx, PEDIDO))).toBe('modelos_de_ativo_so_admin');
    }
  });

  it('categoria e checklist que não existem, inativa ou de outra categoria recusam', async () => {
    const { casos } = montar([atr('admin_grupo')]);
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, categoriaId: 'nao-existe' }))).toBe(
      'categoria_nao_encontrada',
    );
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, checklistModeloId: 'nao-existe' }))).toBe(
      'checklist_nao_encontrado',
    );
    expect(await codigoDe(casos.criar(ctx, { ...PEDIDO, checklistModeloId: 'ck-porta' }))).toBe(
      'modelo_ativo_checklist_invalido',
    );
    expect(
      await codigoDe(
        casos.criar(ctx, {
          ...PEDIDO,
          categoriaId: 'cat-velha',
          campos: {},
          checklistModeloId: null,
        }),
      ),
    ).toBe('modelo_ativo_categoria_inativa');
  });

  it('alterar, desativar e reativar levam a versão vista', async () => {
    const { casos, alteracoes } = montar([atr('admin_grupo')]);
    expect(await casos.alterar(ctx, 'm1', { ...PEDIDO, versao: 4 })).toEqual({ versao: 5 });
    await casos.desativar(ctx, 'm1', 4);
    await casos.reativar(ctx, 'm1', 4);
    expect(
      alteracoes.map((a) => [a.versao, 'ativa' in a.mudanca ? a.mudanca.ativa : 'dados']),
    ).toEqual([
      [4, 'dados'],
      [4, false],
      [4, true],
    ]);
    expect(await codigoDe(casos.desativar(ctx, 'outro', 1))).toBe('modelo_ativo_nao_encontrado');
  });
});
