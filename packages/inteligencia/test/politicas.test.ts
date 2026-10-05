import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA_DO_INTELLIGENCE,
  PADRAO_ATENCAO,
  PADRAO_REINCIDENCIA,
  PADROES_DO_INTELLIGENCE,
  resolverPoliticaDoIntelligence,
  validarPoliticaDoIntelligence,
  valorValidoDoIntelligence,
} from '../src';

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('políticas do Intelligence (ADR-035)', () => {
  it('as cinco chaves do ADR, e todo padrão vale no próprio formato', () => {
    expect(CHAVES_DE_POLITICA_DO_INTELLIGENCE).toEqual([
      'inteligencia.reincidencia',
      'inteligencia.atencao_ativo',
      'inteligencia.efetividade',
      'inteligencia.sistemico',
      'inteligencia.substituicao',
    ]);
    for (const c of CHAVES_DE_POLITICA_DO_INTELLIGENCE)
      expect(valorValidoDoIntelligence(c, copia(PADROES_DO_INTELLIGENCE[c]))).toBe(true);
  });

  it('o limite de custo padrão é R$ 10.000 em 12 meses', () => {
    expect(PADRAO_ATENCAO.limiteCusto12m).toBe(10_000);
  });

  it('peso alterado vale; chave a mais, a menos, negativo ou texto não', () => {
    const v = copia(PADRAO_REINCIDENCIA);
    v.pesos.corretivas = 0.5;
    expect(valorValidoDoIntelligence('inteligencia.reincidencia', v)).toBe(true);

    const aMais = { ...copia(PADRAO_REINCIDENCIA), extra: 1 };
    const aMenos: Record<string, unknown> = copia(PADRAO_REINCIDENCIA);
    delete aMenos['janelaDias'];
    const negativo = copia(PADRAO_REINCIDENCIA);
    negativo.janelaDias = -1;
    const texto = { ...copia(PADRAO_REINCIDENCIA), janelaDias: '90' };
    for (const x of [aMais, aMenos, negativo, texto, null, [], 'x'])
      expect(valorValidoDoIntelligence('inteligencia.reincidencia', x)).toBe(false);
  });

  it('todos os pesos zerados não valem', () => {
    const v = copia(PADRAO_ATENCAO);
    for (const k of Object.keys(v.pesos) as (keyof typeof v.pesos)[]) v.pesos[k] = 0;
    expect(valorValidoDoIntelligence('inteligencia.atencao_ativo', v)).toBe(false);
  });

  it('faixas: começam em 0, crescem, chaves do catálogo sem repetir', () => {
    const com = (faixas: unknown) => ({ ...copia(PADRAO_REINCIDENCIA), faixas });
    const ok = [
      { desde: 0, chave: 'normal' },
      { desde: 60, chave: 'atencao' },
      { desde: 90, chave: 'critico' },
    ];
    expect(valorValidoDoIntelligence('inteligencia.reincidencia', com(ok))).toBe(true);
    for (const ruim of [
      [],
      [{ desde: 10, chave: 'normal' }],
      [
        { desde: 0, chave: 'normal' },
        { desde: 0, chave: 'atencao' },
      ],
      [
        { desde: 0, chave: 'normal' },
        { desde: 50, chave: 'normal' },
      ],
      [{ desde: 0, chave: 'grave' }],
      [
        { desde: 0, chave: 'normal' },
        { desde: 101, chave: 'critico' },
      ],
    ])
      expect(valorValidoDoIntelligence('inteligencia.reincidencia', com(ruim))).toBe(false);
  });

  it('validar: chave desconhecida e valor fora do formato lançam com código', () => {
    expect(() => validarPoliticaDoIntelligence('inteligencia.outra', {})).toThrow(
      expect.objectContaining({ codigo: 'politica_desconhecida' }),
    );
    expect(() => validarPoliticaDoIntelligence('inteligencia.efetividade', {})).toThrow(
      expect.objectContaining({ codigo: 'politica_valor_invalido' }),
    );
  });

  it('resolução: hotel, bandeira, grupo e padrão; o inválido cai para o seguinte', () => {
    const hotel = { janelaDias: 30, limiarPercentual: 10 };
    const bandeira = { janelaDias: 60, limiarPercentual: 15 };
    const grupo = { janelaDias: 120, limiarPercentual: 25 };
    const c = 'inteligencia.efetividade' as const;
    expect(resolverPoliticaDoIntelligence(c, { hotel, bandeira, grupo })).toEqual(hotel);
    expect(resolverPoliticaDoIntelligence(c, { hotel: { x: 1 }, bandeira, grupo })).toEqual(
      bandeira,
    );
    expect(resolverPoliticaDoIntelligence(c, { grupo })).toEqual(grupo);
    expect(resolverPoliticaDoIntelligence(c, {})).toBe(PADROES_DO_INTELLIGENCE[c]);
  });
});
