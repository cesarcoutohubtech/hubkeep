// Modelos de ativo por categoria (M1): quem gere, a validação do modelo, a
// periodicidade sugerida, o preenchimento do ativo (só o vazio) e o modelo
// escolhido na gravação do ativo.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  type DefinicaoDeCampo,
  lerPlanoSugerido,
  podeGerirModelosDeAtivo,
  preencherComModelo,
  validarModeloDeAtivo,
  validarModeloDoAtivo,
} from '../src';

const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

const agora = new Date('2026-10-15T12:00:00Z');
const atr = (papel: Atribuicao['papel'], escopo: Atribuicao['escopo']): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u-1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const DEFINICOES: DefinicaoDeCampo[] = [
  {
    chave: 'btus',
    tipo: 'numero',
    obrigatorio: true,
    rotulos: { 'pt-BR': 'BTUs' },
    unidade: null,
    opcoes: [],
  },
  {
    chave: 'gas',
    tipo: 'texto',
    obrigatorio: false,
    rotulos: { 'pt-BR': 'Gás' },
    unidade: null,
    opcoes: [],
  },
];
const CATEGORIA = { id: 'cat-ar', ativa: true, definicoes: DEFINICOES };
const BASE = {
  nome: '  Split   12.000 ',
  fabricante: ' Fabricante X ',
  modelo: '',
  campos: { btus: 12000 },
  planoSugerido: { intervalo: 3, unidade: 'mes' },
};

describe('modelos de ativo (M1)', () => {
  it('só o Admin do grupo gere os modelos', () => {
    expect(podeGerirModelosDeAtivo([atr('admin_grupo', { tipo: 'grupo' })], agora)).toEqual({
      permitido: true,
    });
    for (const papel of ['gestor_csc', 'gerente_hotel', 'implantador', 'tecnico'] as const) {
      const r = podeGerirModelosDeAtivo([atr(papel, { tipo: 'hotel', hotelId: 'h-1' })], agora);
      expect(r.permitido).toBe(false);
      if (!r.permitido) expect(r.erro.codigo).toBe('modelos_de_ativo_so_admin');
    }
  });

  it('normaliza nome e textos, valida os campos e a periodicidade', () => {
    expect(validarModeloDeAtivo(BASE, CATEGORIA, null)).toEqual({
      categoriaId: 'cat-ar',
      nome: 'Split 12.000',
      fabricante: 'Fabricante X',
      modelo: null,
      campos: { btus: 12000 },
      checklistModeloId: null,
      planoSugerido: { intervalo: 3, unidade: 'mes' },
    });
  });

  it('nenhum campo é obrigatório no modelo, mas a chave e o tipo valem', () => {
    expect(validarModeloDeAtivo({ ...BASE, campos: {} }, CATEGORIA, null).campos).toEqual({});
    expect(
      codigo(() => validarModeloDeAtivo({ ...BASE, campos: { cor: 'x' } }, CATEGORIA, null)),
    ).toBe('campo_desconhecido');
    expect(
      codigo(() => validarModeloDeAtivo({ ...BASE, campos: { btus: 'muito' } }, CATEGORIA, null)),
    ).toBe('valor_de_campo_invalido');
  });

  it('nome vazio e periodicidade fora da regra recusam; sem sugestão é aceito', () => {
    expect(codigo(() => validarModeloDeAtivo({ ...BASE, nome: ' ' }, CATEGORIA, null))).toBe(
      'ativo_nome_invalido',
    );
    expect(
      codigo(() =>
        validarModeloDeAtivo(
          { ...BASE, planoSugerido: { intervalo: 0, unidade: 'mes' } },
          CATEGORIA,
          null,
        ),
      ),
    ).toBe('periodicidade_invalida');
    expect(
      validarModeloDeAtivo({ ...BASE, planoSugerido: null }, CATEGORIA, null).planoSugerido,
    ).toBeNull();
  });

  it('categoria desativada só vale para o modelo que já estava nela', () => {
    const inativa = { ...CATEGORIA, ativa: false };
    expect(codigo(() => validarModeloDeAtivo(BASE, inativa, null))).toBe(
      'modelo_ativo_categoria_inativa',
    );
    expect(validarModeloDeAtivo(BASE, inativa, null, 'cat-ar').categoriaId).toBe('cat-ar');
  });

  it('o checklist precisa estar ativo e ser da categoria, quando tem uma', () => {
    const ok = { id: 'ck-1', ativa: true, categoriaId: 'cat-ar' };
    expect(validarModeloDeAtivo(BASE, CATEGORIA, ok).checklistModeloId).toBe('ck-1');
    expect(
      validarModeloDeAtivo(BASE, CATEGORIA, { ...ok, categoriaId: null }).checklistModeloId,
    ).toBe('ck-1');
    expect(codigo(() => validarModeloDeAtivo(BASE, CATEGORIA, { ...ok, ativa: false }))).toBe(
      'modelo_ativo_checklist_invalido',
    );
    expect(
      codigo(() => validarModeloDeAtivo(BASE, CATEGORIA, { ...ok, categoriaId: 'cat-porta' })),
    ).toBe('modelo_ativo_checklist_invalido');
  });

  it('a periodicidade gravada é lida sem lançar', () => {
    expect(lerPlanoSugerido({ intervalo: 6, unidade: 'semana' })).toEqual({
      intervalo: 6,
      unidade: 'semana',
    });
    expect(lerPlanoSugerido(null)).toBeNull();
    expect(lerPlanoSugerido({ intervalo: 6, unidade: 'ano' })).toBeNull();
    expect(lerPlanoSugerido([])).toBeNull();
  });
});

describe('preencherComModelo (M1)', () => {
  const MODELO = {
    categoriaId: 'cat-ar',
    nome: 'Split 12.000',
    fabricante: 'Fabricante X',
    modelo: 'X-12',
    campos: { btus: 12000, gas: 'R410A', antigo: 'fora da categoria' },
  };

  it('preenche só o que está vazio, inclusive a categoria', () => {
    expect(
      preencherComModelo(
        { categoriaId: null, nome: '', fabricante: null, modelo: '  ', campos: {} },
        MODELO,
        DEFINICOES,
      ),
    ).toEqual({
      categoriaId: 'cat-ar',
      nome: 'Split 12.000',
      fabricante: 'Fabricante X',
      modelo: 'X-12',
      campos: { btus: 12000, gas: 'R410A' },
    });
  });

  it('nunca sobrescreve o que já foi preenchido', () => {
    expect(
      preencherComModelo(
        {
          categoriaId: 'cat-ar',
          nome: 'Split da UH 101',
          fabricante: 'Outro',
          modelo: null,
          campos: { btus: 9000 },
        },
        MODELO,
        DEFINICOES,
      ),
    ).toEqual({
      categoriaId: 'cat-ar',
      nome: 'Split da UH 101',
      fabricante: 'Outro',
      modelo: 'X-12',
      campos: { btus: 9000, gas: 'R410A' },
    });
  });

  it('modelo de outra categoria recusa', () => {
    expect(
      codigo(() =>
        preencherComModelo(
          { categoriaId: 'cat-porta', nome: '', fabricante: null, modelo: null, campos: {} },
          MODELO,
          DEFINICOES,
        ),
      ),
    ).toBe('modelo_ativo_de_outra_categoria');
  });
});

describe('validarModeloDoAtivo (M1)', () => {
  it('sem modelo, nada a conferir; com modelo, ativo e da categoria do ativo', () => {
    expect(() => validarModeloDoAtivo(null, null)).not.toThrow();
    expect(() =>
      validarModeloDoAtivo({ categoriaId: 'cat-ar', ativa: true }, 'cat-ar'),
    ).not.toThrow();
    expect(
      codigo(() => validarModeloDoAtivo({ categoriaId: 'cat-ar', ativa: false }, 'cat-ar')),
    ).toBe('modelo_ativo_inativo');
    expect(
      codigo(() => validarModeloDoAtivo({ categoriaId: 'cat-ar', ativa: true }, 'cat-porta')),
    ).toBe('modelo_ativo_de_outra_categoria');
    expect(codigo(() => validarModeloDoAtivo({ categoriaId: 'cat-ar', ativa: true }, null))).toBe(
      'modelo_ativo_de_outra_categoria',
    );
  });
});
