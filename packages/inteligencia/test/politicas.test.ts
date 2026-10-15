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
  it('as sete chaves do ADR, e todo padrão vale no próprio formato', () => {
    expect(CHAVES_DE_POLITICA_DO_INTELLIGENCE).toEqual([
      'inteligencia.reincidencia',
      'inteligencia.atencao_ativo',
      'inteligencia.efetividade',
      'inteligencia.sistemico',
      'inteligencia.substituicao',
      'inteligencia.metrica_janela_leitura',
      'inteligencia.visibilidade_telas',
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

  it('o mínimo de medições é campo da atenção, padrão 3, inteiro e de pelo menos 1', () => {
    expect(PADRAO_ATENCAO.minMedicoes).toBe(3);
    for (const [minimo, vale] of [
      [1, true],
      [3, true],
      [10, true],
      [0, false],
      [2.5, false],
      [-1, false],
    ] as const)
      expect(
        valorValidoDoIntelligence('inteligencia.atencao_ativo', {
          ...copia(PADRAO_ATENCAO),
          minMedicoes: minimo,
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
    const base = PADROES_DO_INTELLIGENCE[c];
    const hotel = { ...base, janelaDias: 30, reducaoObservadaPercentual: 50 };
    const bandeira = { ...base, janelaDias: 60, reducaoObservadaPercentual: 55 };
    const grupo = { ...base, janelaDias: 120, reducaoObservadaPercentual: 65 };
    expect(registro.resolver(c, { hotel, bandeira, grupo })).toEqual(hotel);
    expect(registro.resolver(c, { hotel: { x: 1 }, bandeira, grupo })).toEqual(bandeira);
    expect(registro.resolver(c, { grupo })).toEqual(grupo);
    expect(registro.resolver(c, {})).toEqual(PADROES_DO_INTELLIGENCE[c]);
  });

  it('a efetividade v3: os limiares da política, na ordem (parcial < observada ≤ 100)', () => {
    expect(PADROES_DO_INTELLIGENCE[c]).toEqual({
      janelaDias: 90,
      reducaoObservadaPercentual: 60,
      reducaoParcialPercentual: 25,
      aumentoObservadoPercentual: 20,
      minChamadosAntes: 3,
      codigosDeIntervencao: ['solucao_troca_do_equipamento'],
    });
    const com = (campos: object) => ({ ...copia(PADROES_DO_INTELLIGENCE[c]), ...campos });
    expect(valorValidoDoIntelligence(c, com({ reducaoObservadaPercentual: 100 }))).toBe(true);
    for (const ruim of [
      { reducaoParcialPercentual: 60 }, // parcial no mesmo ponto da observada
      { reducaoParcialPercentual: 70 }, // parcial depois da observada
      { reducaoParcialPercentual: 0 },
      { reducaoObservadaPercentual: 101 },
      { aumentoObservadoPercentual: 0 },
      { minChamadosAntes: 0 },
      { minChamadosAntes: 2.5 },
      { janelaDias: 0 },
      { limiarPercentual: 20 }, // campo da versão 1: fora do formato
      { codigosDeIntervencao: 'solucao_troca_do_equipamento' },
      { codigosDeIntervencao: ['x', 'x'] },
      { codigosDeIntervencao: [''] },
    ])
      expect(valorValidoDoIntelligence(c, com(ruim))).toBe(false);
    expect(valorValidoDoIntelligence(c, com({ codigosDeIntervencao: [] }))).toBe(true);
    expect(
      valorValidoDoIntelligence(
        c,
        com({ codigosDeIntervencao: ['solucao_troca_do_equipamento', 'solucao_troca_de_peca'] }),
      ),
    ).toBe(true);
  });

  it('a efetividade gravada antes da v3, sem os códigos de intervenção, continua valendo', () => {
    const antiga = copia(PADROES_DO_INTELLIGENCE[c]);
    delete antiga.codigosDeIntervencao;
    antiga.janelaDias = 60;
    expect(valorValidoDoIntelligence(c, antiga)).toBe(true);
    const registro = registroDePoliticas([EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE]);
    expect(registro.resolver(c, { grupo: antiga })).toBe(antiga);
  });

  it('o sistêmico gravado antes da v4, sem a população mínima e o percentual afetado, continua valendo', () => {
    const k = 'inteligencia.sistemico';
    const antiga = copia(PADROES_DO_INTELLIGENCE[k]);
    delete antiga.mesmoModelo.minPopulacao;
    delete antiga.mesmoModelo.percentualMinimoAfetado;
    antiga.mesmoModelo.minAtivos = 5;
    antiga.mesmoAndar.ativa = true;
    expect(valorValidoDoIntelligence(k, antiga)).toBe(true);
    // Só esses dois podem faltar.
    const semJanela = copia(antiga);
    delete (semJanela.mesmoModelo as { janelaDias?: number }).janelaDias;
    expect(valorValidoDoIntelligence(k, semJanela)).toBe(false);
    // O resolvedor fica com a gravada, e não volta ao padrão.
    const registro = registroDePoliticas([EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE]);
    expect(registro.resolver(k, { grupo: antiga })).toBe(antiga);
  });

  it('o sistêmico v2: booleano `ativa` em cada regra, mínimos inteiros de pelo menos 1', () => {
    const k = 'inteligencia.sistemico';
    const base = copia(PADROES_DO_INTELLIGENCE[k]);
    expect(valorValidoDoIntelligence(k, base)).toBe(true);
    const com = (mudar: (c: typeof base) => void) => {
      const c = copia(base);
      mudar(c);
      return c;
    };
    const ruins = [
      com((c) => {
        c.mesmoModelo.minHoteis = 0;
      }),
      com((c) => {
        c.mesmoModelo.minChamados = 2.5;
      }),
      com((c) => {
        c.mesmoModelo.taxaMinimaVezesBase = 0;
      }),
      com((c) => {
        (c.mesmoAndar as { ativa: unknown }).ativa = 'sim';
      }),
      com((c) => {
        delete (c.crescimento as { ativa?: boolean }).ativa;
      }),
      com((c) => {
        c.mesmoFornecedor.minConcluidas = 0;
      }),
      com((c) => {
        c.mesmoModelo.minPopulacao = 0;
      }),
      com((c) => {
        c.mesmoModelo.percentualMinimoAfetado = 101;
      }),
      com((c) => {
        (c.mesmoModelo as Record<string, unknown>)['outroCampo'] = 1;
      }),
    ];
    for (const ruim of ruins) expect(valorValidoDoIntelligence(k, ruim)).toBe(false);
    // Ligar uma regra e afinar a taxa são valores válidos.
    expect(
      valorValidoDoIntelligence(
        k,
        com((c) => {
          c.mesmoAndar.ativa = true;
          c.mesmoModelo.taxaMinima = 0;
        }),
      ),
    ).toBe(true);
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
