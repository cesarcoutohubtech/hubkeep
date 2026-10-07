import { registroDePoliticas } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  CHAVES_DE_POLITICA_DO_INTELLIGENCE,
  PADRAO_ATENCAO,
  PADRAO_REINCIDENCIA,
  EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE,
  MINIMO_DA_JANELA_DE_LEITURA_DIAS,
  PADRAO_JANELA_DE_LEITURA,
  PADROES_DO_INTELLIGENCE,
  ehChaveDePoliticaDoIntelligence,
  janelaDeLeituraEfetiva,
  minimoDaJanelaDeLeitura,
  validarJanelaDeLeitura,
  validarPoliticaDoIntelligence,
  valorValidoDoIntelligence,
} from '../src';

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('políticas do Intelligence (ADR-035)', () => {
  it('as seis chaves do ADR, e todo padrão vale no próprio formato', () => {
    expect(CHAVES_DE_POLITICA_DO_INTELLIGENCE).toEqual([
      'inteligencia.reincidencia',
      'inteligencia.atencao_ativo',
      'inteligencia.efetividade',
      'inteligencia.sistemico',
      'inteligencia.substituicao',
      'inteligencia.metrica_janela_leitura',
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
    const aMenos = Object.fromEntries(
      Object.entries(copia(PADRAO_REINCIDENCIA)).filter(([k]) => k !== 'janelaDias'),
    );
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

  it('o limite do insight é campo da atenção, padrão 70, de 0 a 100', () => {
    expect(PADRAO_ATENCAO.limiteInsight).toBe(70);
    for (const [limite, vale] of [
      [0, true],
      [100, true],
      [101, false],
      [-1, false],
      [Number.NaN, false],
    ] as const)
      expect(
        valorValidoDoIntelligence('inteligencia.atencao_ativo', {
          ...copia(PADRAO_ATENCAO),
          limiteInsight: limite,
        }),
      ).toBe(vale);
  });

  it('chave do protótipo não é chave do Intelligence', () => {
    expect(ehChaveDePoliticaDoIntelligence('toString')).toBe(false);
    expect(ehChaveDePoliticaDoIntelligence('inteligencia.reincidencia')).toBe(true);
  });
});

describe('extensão no registro de políticas do núcleo (adendo ao ADR-026)', () => {
  const registro = registroDePoliticas([EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE]);
  const c = 'inteligencia.efetividade';

  it('o registro aceita as cinco chaves, com o padrão do módulo', () => {
    for (const k of CHAVES_DE_POLITICA_DO_INTELLIGENCE) {
      expect(registro.ehChave(k)).toBe(true);
      expect(registro.padrao(k)).toEqual(PADROES_DO_INTELLIGENCE[k]);
    }
    expect(registro.ehChave('inteligencia.outra')).toBe(false);
  });

  it('a resolução é a do registro: hotel, bandeira, grupo e padrão; o inválido cai', () => {
    const hotel = { janelaDias: 30, limiarPercentual: 10 };
    const bandeira = { janelaDias: 60, limiarPercentual: 15 };
    const grupo = { janelaDias: 120, limiarPercentual: 25 };
    expect(registro.resolver(c, { hotel, bandeira, grupo })).toEqual(hotel);
    expect(registro.resolver(c, { hotel: { x: 1 }, bandeira, grupo })).toEqual(bandeira);
    expect(registro.resolver(c, { grupo })).toEqual(grupo);
    expect(registro.resolver(c, {})).toEqual(PADROES_DO_INTELLIGENCE[c]);
  });

  it('a validação do registro usa o formato do módulo, com o código do núcleo', () => {
    expect(() => registro.validar(c, {})).toThrow(
      expect.objectContaining({ codigo: 'politica_valor_invalido' }),
    );
  });
});

describe('janela de leitura da métrica diária (ADR-035, ADR-036)', () => {
  const c = 'inteligencia.metrica_janela_leitura';

  it('padrão e mínimo de 180 dias; inteiro, até 730, sem outra chave', () => {
    expect(PADRAO_JANELA_DE_LEITURA).toEqual({ dias: 180 });
    expect(MINIMO_DA_JANELA_DE_LEITURA_DIAS).toBe(180);
    for (const dias of [180, 181, 365, 730])
      expect(valorValidoDoIntelligence(c, { dias })).toBe(true);
    for (const ruim of [
      { dias: 179 },
      { dias: 731 },
      { dias: 200.5 },
      { dias: '200' },
      { dias: 200, extra: 1 },
      {},
      null,
    ])
      expect(valorValidoDoIntelligence(c, ruim)).toBe(false);
  });

  it('o mínimo acompanha a efetividade: o dobro dela, e nunca menos que 180', () => {
    expect(minimoDaJanelaDeLeitura(90)).toBe(180);
    expect(minimoDaJanelaDeLeitura(60)).toBe(180);
    expect(minimoDaJanelaDeLeitura(120)).toBe(240);
  });

  it('gravar: a janela abaixo do dobro da efetividade é recusada, com o mínimo nos parâmetros', () => {
    expect(() => validarJanelaDeLeitura(180, 90)).not.toThrow();
    expect(() => validarJanelaDeLeitura(200, 120)).toThrow(
      expect.objectContaining({
        codigo: 'janela_de_leitura_curta',
        parametros: { janelaDias: 200, efetividadeDias: 120, minimo: 240 },
      }),
    );
  });

  it('ler: o job usa o dobro e devolve o aviso quando a janela resolvida ficou curta', () => {
    expect(janelaDeLeituraEfetiva(180, 90)).toEqual({ dias: 180, aviso: null });
    expect(janelaDeLeituraEfetiva(240, 120)).toEqual({ dias: 240, aviso: null });
    expect(janelaDeLeituraEfetiva(200, 120)).toEqual({
      dias: 240,
      aviso: {
        codigo: 'janela_de_leitura_menor_que_o_dobro',
        janelaDias: 200,
        efetividadeDias: 120,
        usadoDias: 240,
      },
    });
  });
});
