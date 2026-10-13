import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA,
  type ExtensaoDePolitica,
  PREFIXOS_DO_NUCLEO,
  ehChaveDePolitica,
  podeGerirPoliticas,
  registroDePoliticas,
  registrosDePoliticasPorModulo,
  resolverPolitica,
  validarPolitica,
  validarRegiao,
} from '../src/politicas';
import type { Atribuicao } from '../src/index';

const AGORA = new Date('2026-09-27T12:00:00Z');
const U1 = '0193a000-0000-4000-8000-000000000001';
const U2 = '0193a000-0000-4000-8000-000000000002';

describe('políticas (ADR-026)', () => {
  it('resolve hotel → grupo → padrão', () => {
    const hotel = { ligado: true, dias: 3 };
    const grupo = { ligado: true, dias: 10 };
    expect(resolverPolitica('os.aceite_automatico', { hotel, grupo })).toEqual(hotel);
    expect(resolverPolitica('os.aceite_automatico', { grupo })).toEqual(grupo);
    expect(resolverPolitica('os.aceite_automatico', {})).toEqual({ ligado: false, dias: 7 });
  });

  it('resolve hotel → bandeira → grupo → padrão (1c)', () => {
    const hotel = { ligado: true, dias: 3 };
    const bandeira = { ligado: true, dias: 5 };
    const grupo = { ligado: true, dias: 10 };
    expect(resolverPolitica('os.aceite_automatico', { hotel, bandeira, grupo })).toEqual(hotel);
    expect(resolverPolitica('os.aceite_automatico', { bandeira, grupo })).toEqual(bandeira);
    // A bandeira fora do formato cai para o grupo.
    expect(
      resolverPolitica('os.aceite_automatico', { bandeira: { ligado: 'sim' }, grupo }),
    ).toEqual(grupo);
  });

  it('valor gravado fora do formato não vale e cai para o nível seguinte', () => {
    expect(
      resolverPolitica('os.aceite_automatico', {
        hotel: { ligado: 'sim' },
        grupo: { ligado: true, dias: 2 },
      }),
    ).toEqual({
      ligado: true,
      dias: 2,
    });
  });

  it.each([
    ['os.aceite_automatico', { ligado: true, dias: 0 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', { ligado: true, dias: 61 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', { ligado: true, dias: 7, extra: 1 }, 'politica_valor_invalido'],
    ['os.aceite_automatico', [true, 7], 'politica_valor_invalido'],
    ['os.codigos_obrigatorios', { ligado: 'sim' }, 'politica_valor_invalido'],
    ['os.codigos_obrigatorios', { ligado: true, extra: 1 }, 'politica_valor_invalido'],
    ['os.codigos_obrigatorios', true, 'politica_valor_invalido'],
    ['os.foto_depois_obrigatoria', { ligado: 1 }, 'politica_valor_invalido'],
    ['os.foto_depois_obrigatoria', { ligado: true, extra: 1 }, 'politica_valor_invalido'],
    ['os.assinatura_no_aceite', { ligado: 'sim' }, 'politica_valor_invalido'],
    ['os.assinatura_no_aceite', false, 'politica_valor_invalido'],
    ['chamado.prioridade_padrao_por_categoria', { nao_uuid: U1 }, 'politica_valor_invalido'],
    ['chamado.nao_existe', {}, 'politica_desconhecida'],
    ['ativo.criticidade', { 6: { 'pt-BR': 'Seis' } }, 'politica_valor_invalido'],
    ['ativo.criticidade', { 1: { de: 'Niedrig' } }, 'politica_valor_invalido'],
    ['ativo.criticidade', { 1: { 'pt-BR': '   ' } }, 'politica_valor_invalido'],
    ['ativo.criticidade', { 1: 'Baixa' }, 'politica_valor_invalido'],
    ['ativo.criticidade', { 1: { 'pt-BR': 'x'.repeat(121) } }, 'politica_valor_invalido'],
  ] as const)('%s %o: %s', (chave, valor, codigo) => {
    expect(() => validarPolitica(chave, valor)).toThrow(expect.objectContaining({ codigo }));
  });

  it('valores válidos passam', () => {
    expect(validarPolitica('os.aceite_automatico', { ligado: false, dias: 60 })).toEqual({
      ligado: false,
      dias: 60,
    });
    expect(validarPolitica('chamado.prioridade_padrao_por_categoria', { [U1]: U2 })).toEqual({
      [U1]: U2,
    });
    const nomes = { 1: { 'pt-BR': 'Baixa', en: 'Low' }, 5: { fr: 'Critique' } };
    expect(validarPolitica('ativo.criticidade', nomes)).toEqual(nomes);
    expect(resolverPolitica('ativo.criticidade', {})).toEqual({});
    // I6: desligada por padrão; o hotel liga.
    expect(resolverPolitica('os.codigos_obrigatorios', {})).toEqual({ ligado: false });
    expect(
      resolverPolitica('os.codigos_obrigatorios', {
        hotel: { ligado: true },
        grupo: { ligado: false },
      }),
    ).toEqual({ ligado: true });
    // I8: as duas desligadas por padrão; o hotel liga.
    for (const chave of ['os.foto_depois_obrigatoria', 'os.assinatura_no_aceite'] as const) {
      expect(resolverPolitica(chave, {})).toEqual({ ligado: false });
      expect(resolverPolitica(chave, { hotel: { ligado: true } })).toEqual({ ligado: true });
    }
  });

  it('só o Admin do grupo configura', () => {
    const atr = (papel: Atribuicao['papel']): Atribuicao => ({
      id: 'a',
      usuarioId: 'u',
      papel,
      escopo: papel === 'admin_grupo' ? { tipo: 'grupo' } : { tipo: 'hotel', hotelId: 'h' },
      validoAte: null,
      revogadoEm: null,
    });
    expect(podeGerirPoliticas([atr('admin_grupo')], AGORA).permitido).toBe(true);
    const r = podeGerirPoliticas([atr('gerente_hotel')], AGORA);
    expect(r.permitido ? 'ok' : r.erro.codigo).toBe('configuracao_so_admin');
  });
});

describe('registro de políticas (extensão de módulo, adendo ao ADR-026)', () => {
  const formato = (_c: string, v: unknown) =>
    typeof v === 'object' && v !== null && Number.isInteger((v as { n?: unknown }).n);
  const modulo = (e: Partial<ExtensaoDePolitica> = {}): ExtensaoDePolitica => ({
    prefixo: 'modulo.',
    chaves: ['modulo.a', 'modulo.b'],
    padrao: (c) => ({ n: c === 'modulo.a' ? 1 : 2 }),
    valido: formato,
    ...e,
  });

  it('sem extensão, só as chaves do núcleo, com o mesmo comportamento', () => {
    const r = registroDePoliticas([]);
    expect(r.chaves()).toEqual(CHAVES_DE_POLITICA);
    expect(r.resolver('os.aceite_automatico', {})).toEqual({ ligado: false, dias: 7 });
    expect(() => r.validar('modulo.a', { n: 1 })).toThrow(
      expect.objectContaining({ codigo: 'politica_desconhecida' }),
    );
  });

  it('as chaves do núcleo usam os prefixos reservados', () => {
    for (const c of CHAVES_DE_POLITICA)
      expect(PREFIXOS_DO_NUCLEO.some((p) => c.startsWith(p))).toBe(true);
  });

  it('com a extensão: chave, padrão, formato e resolução hotel → bandeira → grupo → padrão', () => {
    const r = registroDePoliticas([modulo()]);
    expect(r.chaves()).toEqual([...CHAVES_DE_POLITICA, 'modulo.a', 'modulo.b']);
    expect(r.ehChave('modulo.a')).toBe(true);
    expect(r.ehDoNucleo('modulo.a')).toBe(false);
    expect(r.ehDoNucleo('os.aceite_automatico')).toBe(true);
    expect(r.padrao('modulo.b')).toEqual({ n: 2 });
    expect(r.validar('modulo.a', { n: 5 })).toEqual({ n: 5 });
    expect(() => r.validar('modulo.a', { n: 'x' })).toThrow(
      expect.objectContaining({ codigo: 'politica_valor_invalido' }),
    );
    expect(() => r.padrao('modulo.c')).toThrow(
      expect.objectContaining({ codigo: 'politica_desconhecida' }),
    );
    const [hotel, bandeira, grupo] = [{ n: 3 }, { n: 4 }, { n: 5 }];
    expect(r.resolver('modulo.a', { hotel, bandeira, grupo })).toEqual(hotel);
    expect(r.resolver('modulo.a', { hotel: { n: 'x' }, bandeira, grupo })).toEqual(bandeira);
    expect(r.resolver('modulo.a', { grupo })).toEqual(grupo);
    expect(r.resolver('modulo.a', {})).toEqual({ n: 1 });
    // A chave do núcleo também lê a bandeira no registro.
    const aceite = { ligado: true, dias: 9 };
    expect(r.resolver('os.aceite_automatico', { bandeira: aceite })).toEqual(aceite);
  });

  it.each([
    ['prefixo sem ponto', [modulo({ prefixo: 'modulo' })]],
    ['prefixo do núcleo', [modulo({ prefixo: 'os.', chaves: ['os.x'] })]],
    ['prefixo repetido', [modulo(), modulo({ chaves: ['modulo.c'] })]],
    ['chave fora do prefixo', [modulo({ chaves: ['outro.a'] })]],
    ['chave só com o prefixo', [modulo({ chaves: ['modulo.'] })]],
    ['chave repetida', [modulo({ chaves: ['modulo.a', 'modulo.a'] })]],
    ['padrão fora do formato', [modulo({ padrao: () => ({ n: 'x' }) })]],
  ] as const)('extensão inválida lança na montagem: %s', (_caso, extensoes) => {
    expect(() => registroDePoliticas(extensoes)).toThrow(Error);
  });

  describe('por módulo contratado (adendo da I7)', () => {
    const inteligencia = (e: Partial<ExtensaoDePolitica> = {}) => ({
      modulo: 'inteligencia' as const,
      extensao: modulo({ prefixo: 'inteligencia.', chaves: ['inteligencia.a'], ...e }),
    });

    it('o tenant sem o módulo só tem as chaves do núcleo; com ele, as do módulo também', () => {
      const r = registrosDePoliticasPorModulo([inteligencia()]);
      expect(r.doNucleo.chaves()).toEqual(CHAVES_DE_POLITICA);
      expect(r.doTenant(new Set()).chaves()).toEqual(CHAVES_DE_POLITICA);
      expect(() => r.doTenant(new Set()).validar('inteligencia.a', { n: 1 })).toThrow(
        expect.objectContaining({ codigo: 'politica_desconhecida' }),
      );
      const comModulo = r.doTenant(new Set(['inteligencia']));
      expect(comModulo.chaves()).toEqual([...CHAVES_DE_POLITICA, 'inteligencia.a']);
      expect(comModulo.validar('inteligencia.a', { n: 3 })).toEqual({ n: 3 });
      // Montados na partida: o mesmo registro em todo request.
      expect(r.doTenant(new Set(['inteligencia']))).toBe(comModulo);
      expect(r.doTenant(new Set())).toBe(r.doNucleo);
    });

    it('sem extensão de módulo, todo tenant fica com o núcleo', () => {
      const r = registrosDePoliticasPorModulo([]);
      expect(r.doTenant(new Set(['inteligencia'])).chaves()).toEqual(CHAVES_DE_POLITICA);
    });

    it.each([
      [
        'módulo repetido',
        [inteligencia(), inteligencia({ prefixo: 'outro.', chaves: ['outro.a'] })],
      ],
      ['módulo fora da lista', [{ modulo: 'outro' as 'inteligencia', extensao: modulo() }]],
      ['extensão inválida', [inteligencia({ chaves: ['fora.a'] })]],
    ] as const)('lança na montagem: %s', (_caso, extensoes) => {
      expect(() => registrosDePoliticasPorModulo(extensoes)).toThrow(Error);
    });
  });

  it('chave herdada do protótipo não é política', () => {
    expect(ehChaveDePolitica('toString')).toBe(false);
    expect(() => validarPolitica('toString', {})).toThrow(
      expect.objectContaining({ codigo: 'politica_desconhecida' }),
    );
    expect(registroDePoliticas([]).ehChave('constructor')).toBe(false);
  });
});

describe('região', () => {
  it.each([
    [{ pais: 'Brasil' }, 'pais_invalido'],
    [{ pais: 'BR', subdivisao: 'AR-B' }, 'subdivisao_invalida'],
    [{ subdivisao: 'PR' }, 'subdivisao_invalida'],
    [{ moeda: 'real' }, 'moeda_invalida'],
  ] as const)('%o: %s', (r, codigo) => {
    expect(() => validarRegiao(r)).toThrow(expect.objectContaining({ codigo }));
  });

  it('formatos ISO passam', () => {
    expect(() => validarRegiao({ pais: 'BR', subdivisao: 'BR-PR', moeda: 'BRL' })).not.toThrow();
    expect(() => validarRegiao({ pais: null, subdivisao: null, moeda: null })).not.toThrow();
  });
});
