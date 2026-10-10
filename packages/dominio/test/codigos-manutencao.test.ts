// Códigos de falha, causa e solução (I6): padrões, quem gere, o filtro pela
// categoria do ativo, a validação do aceite, a sugestão da conclusão (que
// nunca recusa) e a cobrança da política os.codigos_obrigatorios no aceite.
import { describe, expect, it } from 'vitest';
import {
  type Atribuicao,
  CATEGORIAS_PADRAO,
  CODIGOS_PADRAO,
  type CodigoParaRegra,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
  codigosQueServem,
  exigirCodigosNoAceite,
  podeGerirCodigos,
  sugestaoDosCodigos,
  validarCodigosDaOs,
  validarNomesDeCodigo,
  validarTipoDeCodigo,
} from '../src';

const agora = new Date('2026-10-10T12:00:00Z');
const codigo = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo: string }).codigo;
  }
};

const REFRIGERACAO = 'cat-refrigeracao';
const ELETRICA = 'cat-eletrica';
const c = (
  id: string,
  tipo: CodigoParaRegra['tipo'],
  categoriaId: string | null = null,
  ativa = true,
): CodigoParaRegra => ({ id, tipo, categoriaId, ativa });
const CODIGOS = [
  c('f-geral', 'falha'),
  c('f-refri', 'falha', REFRIGERACAO),
  c('f-eletr', 'falha', ELETRICA),
  c('f-inativa', 'falha', null, false),
  c('c-geral', 'causa'),
  c('s-geral', 'solucao'),
];

describe('padrões', () => {
  it('chaves únicas, no formato do banco, com prefixo do tipo', () => {
    const chaves = CODIGOS_PADRAO.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const p of CODIGOS_PADRAO) {
      expect(p.chave).toMatch(/^[a-z][a-z0-9_]{1,79}$/);
      expect(p.chave.startsWith(`${p.tipo}_`)).toBe(true);
    }
  });

  it('os três tipos têm padrão; toda categoria padrão tem falha própria', () => {
    for (const tipo of TIPOS_DE_CODIGO_DE_MANUTENCAO)
      expect(CODIGOS_PADRAO.some((p) => p.tipo === tipo)).toBe(true);
    for (const categoria of CATEGORIAS_PADRAO)
      expect(CODIGOS_PADRAO.some((p) => p.categoria === categoria && p.tipo === 'falha')).toBe(
        true,
      );
    // Causas e soluções servem a todas as categorias.
    expect(
      CODIGOS_PADRAO.filter((p) => p.tipo !== 'falha').every((p) => p.categoria === null),
    ).toBe(true);
  });
});

describe('quem gere e o cadastro', () => {
  const a = (papel: Atribuicao['papel']): Atribuicao => ({
    id: 'x',
    usuarioId: 'u',
    papel,
    escopo: { tipo: 'grupo' },
    validoAte: null,
    revogadoEm: null,
  });

  it('só o Admin do grupo', () => {
    expect(podeGerirCodigos([a('admin_grupo')], agora).permitido).toBe(true);
    const r = podeGerirCodigos([a('gestor_csc')], agora);
    expect(r.permitido).toBe(false);
    expect(!r.permitido && r.erro.codigo).toBe('codigos_so_admin');
  });

  it('tipo da lista', () => {
    expect(validarTipoDeCodigo('causa')).toBe('causa');
    expect(codigo(() => validarTipoDeCodigo('defeito'))).toBe('codigo_tipo_invalido');
  });

  it('o código do tenant precisa de nome; o padrão pode ficar sem', () => {
    expect(validarNomesDeCodigo({ 'pt-BR': ' Vazamento  no dreno ' }, null)).toEqual({
      'pt-BR': 'Vazamento no dreno',
    });
    expect(codigo(() => validarNomesDeCodigo({}, null))).toBe('codigo_nome_invalido');
    expect(codigo(() => validarNomesDeCodigo({ 'pt-BR': 'x'.repeat(121) }, null))).toBe(
      'codigo_nome_invalido',
    );
    expect(codigo(() => validarNomesDeCodigo({ de: 'Leck' }, null))).toBe('codigo_nome_invalido');
    expect(validarNomesDeCodigo({}, 'falha_vazamento')).toEqual({});
  });
});

describe('o filtro pela categoria do ativo', () => {
  it('ativos, do tipo, da categoria do ativo primeiro e depois os de todas', () => {
    expect(codigosQueServem(CODIGOS, 'falha', REFRIGERACAO).map((x) => x.id)).toEqual([
      'f-refri',
      'f-geral',
    ]);
  });

  it('sem categoria do ativo (sem ativo no chamado): qualquer código ativo do tipo', () => {
    expect(codigosQueServem(CODIGOS, 'falha', null).map((x) => x.id)).toEqual([
      'f-refri',
      'f-eletr',
      'f-geral',
    ]);
  });
});

describe('no aceite, o código que não serve é recusado', () => {
  const pedido = (falhaId: string | null, causaId: string | null = null) => ({
    falhaId,
    causaId,
    solucaoId: null,
  });

  it('o que serve passa, inclusive vazio', () => {
    expect(validarCodigosDaOs(pedido('f-refri', 'c-geral'), CODIGOS, REFRIGERACAO)).toEqual(
      pedido('f-refri', 'c-geral'),
    );
    expect(validarCodigosDaOs(pedido(null), CODIGOS, REFRIGERACAO)).toEqual(pedido(null));
  });

  it.each([
    ['não existe (ou de outro tenant)', pedido('nenhum'), 'codigo_nao_encontrado'],
    ['código de causa na coluna da falha', pedido('c-geral'), 'codigo_de_outro_tipo'],
    ['desativado', pedido('f-inativa'), 'codigo_inativo'],
    ['de outra categoria', pedido('f-eletr'), 'codigo_de_outra_categoria'],
  ])('%s', (_, p, esperado) => {
    expect(codigo(() => validarCodigosDaOs(p, CODIGOS, REFRIGERACAO))).toBe(esperado);
  });

  it('a recusa diz a coluna', () => {
    try {
      validarCodigosDaOs(pedido(null, 'f-geral'), CODIGOS, REFRIGERACAO);
      expect.unreachable();
    } catch (e) {
      expect((e as { parametros: object }).parametros).toEqual({ tipo: 'causa' });
    }
  });
});

describe('na conclusão, os códigos são sugestão e nunca recusam', () => {
  it('o que serve é gravado; o que não serve vira null, com o motivo', () => {
    const r = sugestaoDosCodigos(
      { falhaId: 'f-eletr', causaId: 'c-geral', solucaoId: 'nenhum' },
      CODIGOS,
      REFRIGERACAO,
    );
    expect(r.codigos).toEqual({ falhaId: null, causaId: 'c-geral', solucaoId: null });
    expect(r.descartados).toEqual([
      { tipo: 'falha', motivo: 'codigo_de_outra_categoria' },
      { tipo: 'solucao', motivo: 'codigo_nao_encontrado' },
    ]);
  });

  it('sem códigos, nada a gravar nem a descartar', () => {
    expect(sugestaoDosCodigos({}, CODIGOS, null)).toEqual({
      codigos: { falhaId: null, causaId: null, solucaoId: null },
      descartados: [],
    });
  });
});

describe('a política os.codigos_obrigatorios, só no aceite', () => {
  const todos = { falhaId: 'f', causaId: 'c', solucaoId: 's' };

  it('desligada: aceita sem código nenhum', () => {
    expect(() =>
      exigirCodigosNoAceite(false, { falhaId: null, causaId: null, solucaoId: null }),
    ).not.toThrow();
  });

  it('ligada: exige os três, com o número que falta', () => {
    expect(() => exigirCodigosNoAceite(true, todos)).not.toThrow();
    try {
      exigirCodigosNoAceite(true, { ...todos, causaId: null, solucaoId: null });
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({
        codigo: 'codigos_obrigatorios_no_aceite',
        parametros: { faltam: 2 },
      });
    }
  });
});
