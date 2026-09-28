import { describe, expect, it } from 'vitest';
import {
  type DefinicaoDeCampo,
  lerDefinicoes,
  lerValores,
  normalizarRotulos,
  validarDefinicoes,
  validarMudancaDeDefinicoes,
  validarValores,
} from '../src/campos-tipados';
import { podeGerirCategorias, validarNomesDeCategoria } from '../src/categorias';
import type { Atribuicao } from '../src/index';

const potencia = {
  chave: 'potencia',
  tipo: 'numero',
  obrigatorio: true,
  rotulos: { 'pt-BR': 'Potência' },
  unidade: 'kW',
};
const gas = {
  chave: 'gas',
  tipo: 'lista',
  rotulos: { 'pt-BR': 'Gás', en: 'Gas' },
  opcoes: [
    { chave: 'r410a', rotulos: { 'pt-BR': 'R-410A' } },
    { chave: 'r32', rotulos: { 'pt-BR': 'R-32' } },
  ],
};

describe('definições de campo (ADR-028)', () => {
  it('normaliza e completa a forma', () => {
    expect(
      validarDefinicoes([
        potencia,
        gas,
        { chave: 'instalado_em', tipo: 'data', rotulos: { es: ' Instalado ' } },
      ]),
    ).toEqual([
      {
        chave: 'potencia',
        tipo: 'numero',
        obrigatorio: true,
        rotulos: { 'pt-BR': 'Potência' },
        unidade: 'kW',
        opcoes: [],
      },
      {
        chave: 'gas',
        tipo: 'lista',
        obrigatorio: false,
        rotulos: { 'pt-BR': 'Gás', en: 'Gas' },
        unidade: null,
        opcoes: [
          { chave: 'r410a', rotulos: { 'pt-BR': 'R-410A' } },
          { chave: 'r32', rotulos: { 'pt-BR': 'R-32' } },
        ],
      },
      {
        chave: 'instalado_em',
        tipo: 'data',
        obrigatorio: false,
        rotulos: { es: 'Instalado' },
        unidade: null,
        opcoes: [],
      },
    ]);
  });

  it.each([
    [{}, 'lista', 'formato'],
    [[{ chave: 'Potência', tipo: 'numero', rotulos: { 'pt-BR': 'x' } }], '0', 'chave'],
    [[potencia, potencia], 'potencia', 'chave_repetida'],
    [[{ chave: 'x', tipo: 'foto', rotulos: { 'pt-BR': 'x' } }], 'x', 'tipo'],
    [[{ chave: 'x', tipo: 'texto', rotulos: {} }], 'x', 'rotulos'],
    [[{ chave: 'x', tipo: 'texto', rotulos: { de: 'x' } }], 'x', 'rotulos'],
    [[{ chave: 'x', tipo: 'texto', rotulos: { 'pt-BR': 'x' }, unidade: 'kW' }], 'x', 'unidade'],
    [[{ chave: 'x', tipo: 'lista', rotulos: { 'pt-BR': 'x' }, opcoes: [] }], 'x', 'opcoes'],
    [[{ chave: 'x', tipo: 'texto', rotulos: { 'pt-BR': 'x' }, opcoes: gas.opcoes }], 'x', 'opcoes'],
    [
      [{ chave: 'x', tipo: 'texto', rotulos: { 'pt-BR': 'x' }, obrigatorio: 'sim' }],
      'x',
      'obrigatorio',
    ],
  ])('%o é recusado (%s: %s)', (defs, campo, motivo) => {
    expect(() => validarDefinicoes(defs)).toThrow(
      expect.objectContaining({
        codigo: 'definicao_de_campo_invalida',
        parametros: { campo, motivo },
      }),
    );
  });

  it('o tipo de um campo existente não muda; o resto pode mudar', () => {
    const antigas = validarDefinicoes([potencia, gas]);
    const novas = validarDefinicoes([
      { ...potencia, obrigatorio: false, rotulos: { en: 'Power' } },
      { chave: 'serie', tipo: 'texto', rotulos: { 'pt-BR': 'Série' }, obrigatorio: true },
    ]);
    expect(() => validarMudancaDeDefinicoes(antigas, novas)).not.toThrow();
    expect(() =>
      validarMudancaDeDefinicoes(
        antigas,
        validarDefinicoes([{ ...potencia, tipo: 'texto', unidade: null }]),
      ),
    ).toThrow(
      expect.objectContaining({
        codigo: 'campo_muda_de_tipo',
        parametros: { campo: 'potencia', de: 'numero', para: 'texto' },
      }),
    );
  });

  it('definição gravada fora do formato é descartada na leitura, sem lançar', () => {
    expect(lerDefinicoes([potencia, { chave: 'x' }, 'lixo']).map((d) => d.chave)).toEqual([
      'potencia',
    ]);
    expect(lerDefinicoes({})).toEqual([]);
  });
});

describe('valores (ADR-028)', () => {
  const defs: DefinicaoDeCampo[] = validarDefinicoes([
    potencia,
    gas,
    { chave: 'instalado_em', tipo: 'data', rotulos: { 'pt-BR': 'Instalado em' } },
    { chave: 'ligado', tipo: 'sim_nao', rotulos: { 'pt-BR': 'Ligado' } },
    { chave: 'obs', tipo: 'texto', rotulos: { 'pt-BR': 'Obs.' } },
  ]);

  it('aceita os tipos e trata vazio como não preenchido', () => {
    expect(
      validarValores(defs, {
        potencia: 3.5,
        gas: 'r32',
        instalado_em: '2026-01-31',
        ligado: false,
        obs: ' ok ',
      }),
    ).toEqual({
      potencia: 3.5,
      gas: 'r32',
      instalado_em: '2026-01-31',
      ligado: false,
      obs: 'ok',
    });
    expect(validarValores(defs, { potencia: 1, obs: '', gas: null })).toEqual({ potencia: 1 });
  });

  it.each([
    [{}, 'campo_obrigatorio', 'potencia'],
    [{ potencia: '3' }, 'valor_de_campo_invalido', 'potencia'],
    [{ potencia: 1, gas: 'r22' }, 'valor_de_campo_invalido', 'gas'],
    [{ potencia: 1, instalado_em: '2026-02-30' }, 'valor_de_campo_invalido', 'instalado_em'],
    [{ potencia: 1, ligado: 'sim' }, 'valor_de_campo_invalido', 'ligado'],
    [{ potencia: 1, cor: 'azul' }, 'campo_desconhecido', 'cor'],
  ])('%o: %s em %s', (valores, codigo, campo) => {
    expect(() => validarValores(defs, valores)).toThrow(
      expect.objectContaining({ codigo, parametros: { campo } }),
    );
  });

  it('campo novo obrigatório vale para gravações novas; a leitura do que já foi gravado não quebra', () => {
    const gravado = validarValores(defs, { potencia: 2, gas: 'r410a' });
    const depois = validarDefinicoes([
      ...defs,
      { chave: 'serie', tipo: 'texto', obrigatorio: true, rotulos: { 'pt-BR': 'Série' } },
    ]);
    expect(lerValores(depois, gravado)).toEqual({ potencia: 2, gas: 'r410a' });
    expect(() => validarValores(depois, gravado)).toThrow(
      expect.objectContaining({ codigo: 'campo_obrigatorio' }),
    );
    // Opção tirada da lista: o valor antigo some da leitura, sem erro.
    const semR410a = validarDefinicoes([potencia, { ...gas, opcoes: [gas.opcoes[1]] }]);
    expect(lerValores(semR410a, gravado)).toEqual({ potencia: 2 });
  });
});

describe('categorias', () => {
  const agora = new Date('2026-09-28T12:00:00Z');
  const atr = (papel: Atribuicao['papel']): Atribuicao => ({
    id: 'a',
    usuarioId: 'u',
    papel,
    escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h' },
    validoAte: null,
    revogadoEm: null,
  });

  it('só o Admin do grupo gere', () => {
    expect(podeGerirCategorias([atr('admin_grupo')], agora).permitido).toBe(true);
    const r = podeGerirCategorias([atr('gerente_hotel')], agora);
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('categorias_so_admin');
  });

  it('a categoria do tenant precisa de nome; a padrão pode ficar sem (vem do catálogo)', () => {
    expect(validarNomesDeCategoria({ 'pt-BR': ' Saunas ' }, null)).toEqual({ 'pt-BR': 'Saunas' });
    expect(validarNomesDeCategoria({}, 'refrigeracao')).toEqual({});
    expect(() => validarNomesDeCategoria({}, null)).toThrow(
      expect.objectContaining({ codigo: 'categoria_nome_invalido' }),
    );
    expect(() => validarNomesDeCategoria({ 'pt-BR': 'x'.repeat(121) }, null)).toThrow(
      expect.objectContaining({ codigo: 'categoria_nome_invalido' }),
    );
    expect(normalizarRotulos({ 'pt-BR': '  ' })).toBeNull();
  });
});
