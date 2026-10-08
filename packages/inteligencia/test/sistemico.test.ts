// Possível problema sistêmico. Casos da seção 37 do PRD: 8 UHs do mesmo andar
// com água fria em 10 dias e 17 equipamentos iguais, em hotéis diferentes,
// com a mesma falha. O resultado é sempre "possível".
import { describe, expect, it } from 'vitest';
import { IDIOMAS, criarTradutor } from '@hubkeep/i18n';
import {
  type AtivoAnalisado,
  type ConfigSistemico,
  type EntradaSistemico,
  type LocalAnalisado,
  PADRAO_SISTEMICO,
  VERSAO_SISTEMICO,
  detectarSistemicos as detectar,
} from '../src';
import { agora, corretiva, dia, todasAsRegras } from './apoio';

// Por padrão só o mesmo modelo vem ligado (v2). Os testes das outras regras ligam as cinco;
// os do mesmo modelo usam o padrão da política, de propósito.
const detectarSistemicos = (
  e: EntradaSistemico,
  quando: Date,
  config: ConfigSistemico = todasAsRegras,
) => detectar(e, quando, config);

const uhs = (n: number, andar: string | null, hotelId = 'h1'): LocalAnalisado[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${hotelId}-uh${i}`, hotelId, andar }));

describe('mesmo andar', () => {
  it('PRD 37: 8 UHs do mesmo andar com água fria em 10 dias → possível problema sistêmico', () => {
    const locais = uhs(8, '3');
    const corretivas = locais.map((l, i) =>
      corretiva({
        hotelId: 'h1',
        localId: l.id,
        ativoId: null,
        codigoFalha: 'agua_fria',
        abertaEm: dia(-i),
      }),
    );
    const sinais = detectarSistemicos({ corretivas, ativos: [], locais }, agora);
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      regra: 'mesmo_andar',
      situacao: 'possivel',
      chave: { hotelId: 'h1', andar: '3', falha: 'agua_fria' },
      evidencia: { quantidade: 8, distintos: 8, janelaDias: 10 },
    });
  });

  it('abaixo do mínimo de UHs, fora da janela ou em andares diferentes, nada', () => {
    const quatro = uhs(4, '3');
    const espalhadas = uhs(8, '3');
    const andares = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`,
      hotelId: 'h1',
      andar: `${i}`,
    }));
    const de = (ls: LocalAnalisado[], passo: number) =>
      ls.map((l, i) =>
        corretiva({
          localId: l.id,
          ativoId: null,
          codigoFalha: 'agua_fria',
          abertaEm: dia(-i * passo),
        }),
      );
    for (const [locais, passo] of [
      [quatro, 1],
      [espalhadas, 3], // só 4 caem nos últimos 10 dias
      [andares, 1],
    ] as const)
      expect(
        detectarSistemicos(
          { corretivas: de([...locais], passo), ativos: [], locais: [...locais] },
          agora,
        ).filter((s) => s.regra === 'mesmo_andar'),
      ).toEqual([]);
  });

  it('sem código de falha nem ativo com categoria, a corretiva não agrupa', () => {
    const locais = uhs(8, '3');
    const corretivas = locais.map((l) =>
      corretiva({ localId: l.id, ativoId: null, abertaEm: dia(-1) }),
    );
    expect(detectarSistemicos({ corretivas, ativos: [], locais }, agora)).toEqual([]);
  });
});

describe('mesmo modelo (versão 2: mínimos da política e taxa contra a base)', () => {
  const D = (
    as: readonly AtivoAnalisado[],
    cs: ReturnType<typeof corretiva>[],
    c = PADRAO_SISTEMICO,
  ) =>
    detectar({ corretivas: cs, ativos: as, locais: [] }, agora, c).filter(
      (s) => s.regra === 'mesmo_modelo',
    );
  /** `n` ativos do mesmo modelo (grafias diferentes, como chegam do cadastro), em `hoteis` hotéis. */
  const parque = (n: number, hoteis: number, categoriaId = 'hvac'): AtivoAnalisado[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i}`,
      hotelId: `h${i % hoteis}`,
      categoriaId,
      fabricante: i % 2 ? ' Carrier ' : 'carrier',
      modelo: i % 2 ? 'XPower 12' : 'xpower 12',
    }));
  /** Os outros modelos da mesma categoria: `n` ativos de outro fabricante. */
  const outros = (n: number): AtivoAnalisado[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `o${i}`,
      hotelId: `h${i % 3}`,
      categoriaId: 'hvac',
      fabricante: 'Trane',
      modelo: 'T9',
    }));
  /** Um chamado por ativo da lista, dentro da janela. */
  const chamados = (as: readonly AtivoAnalisado[], vezes = 1, codigoFalha: string | null = null) =>
    as.flatMap((a, i) =>
      Array.from({ length: vezes }, (_, v) =>
        corretiva({
          hotelId: a.hotelId,
          localId: `l${a.id}`,
          ativoId: a.id,
          codigoFalha,
          abertaEm: dia(-1 - i - v * 20),
        }),
      ),
    );

  it('o padrão é o aprovado: 3 hotéis, 6 chamados em 90 dias, 5 ativos, dobro da base e mínimo 0,3', () => {
    expect(VERSAO_SISTEMICO).toBe(2);
    expect(PADRAO_SISTEMICO.mesmoModelo).toEqual({
      ativa: true,
      minHoteis: 3,
      minChamados: 6,
      minAtivos: 5,
      janelaDias: 90,
      taxaMinimaVezesBase: 2,
      taxaMinima: 0.3,
    });
  });

  it('6 ativos do mesmo modelo em 3 hotéis, 1 chamado cada → possível problema, com a taxa e a base', () => {
    const as = parque(6, 3);
    const sinais = D(as, chamados(as));
    expect(sinais).toHaveLength(1);
    expect(sinais[0]).toMatchObject({
      situacao: 'possivel',
      versao: 2,
      chave: { categoriaId: 'hvac', modelo: 'carrier|xpower 12' },
      evidencia: {
        quantidade: 6,
        distintos: 6,
        janelaDias: 90,
        hotelIds: ['h0', 'h1', 'h2'],
        ativosDoModelo: 6,
        taxaPorAtivo: 1,
        basePorAtivo: 0,
      },
    });
  });

  it('agrupa por categoria, fabricante e modelo, sem olhar a falha', () => {
    const as = parque(6, 3);
    const cs = as.map((a, i) =>
      corretiva({
        hotelId: a.hotelId,
        localId: `l${i}`,
        ativoId: a.id,
        codigoFalha: `falha${i}`,
        abertaEm: dia(-1 - i),
      }),
    );
    expect(D(as, cs)).toHaveLength(1);
    // O mesmo fabricante e modelo em outra categoria é outro grupo.
    const mistos = [
      ...parque(3, 3, 'hvac'),
      ...parque(3, 3, 'bomba').map((a) => ({ ...a, id: `b${a.id}` })),
    ];
    expect(D(mistos, chamados(mistos))).toEqual([]);
  });

  it.each([
    ['2 hotéis (mínimo 3)', () => parque(6, 2), 1],
    ['5 chamados (mínimo 6)', () => parque(5, 3), 1],
    ['4 ativos com chamado (mínimo 5), mesmo com 8 chamados', () => parque(4, 3), 2],
  ] as const)('abaixo do mínimo, nada: %s', (_nome, montar, vezes) => {
    const as = montar();
    expect(D(as, chamados(as, vezes))).toEqual([]);
  });

  it('chamado fora dos 90 dias não conta', () => {
    const as = parque(6, 3);
    const velhos = as.map((a) =>
      corretiva({ hotelId: a.hotelId, ativoId: a.id, abertaEm: dia(-100) }),
    );
    expect(D(as, velhos)).toEqual([]);
  });

  it('taxa de pelo menos o dobro da base: no limite entra, um chamado a mais na base tira', () => {
    const as = parque(6, 3); // taxa 6/6 = 1
    const cs = chamados(as);
    const base = outros(10);
    // Base de 5 chamados em 10 ativos = 0,5; o dobro é 1,0, e a taxa de 1,0 passa.
    const noLimite = D([...as, ...base], [...cs, ...chamados(base.slice(0, 5))]);
    expect(noLimite).toHaveLength(1);
    expect(noLimite[0]?.evidencia).toMatchObject({ taxaPorAtivo: 1, basePorAtivo: 0.5 });
    // Base de 6 em 10 = 0,6; o dobro é 1,2, e a taxa de 1,0 não passa.
    expect(D([...as, ...base], [...cs, ...chamados(base.slice(0, 6))])).toEqual([]);
  });

  it('a taxa nunca vale menos que 0,3: 6 chamados em 30 ativos instalados (0,2) não é sinal', () => {
    const instalados = parque(30, 3);
    const comChamado = instalados.slice(0, 6);
    expect(D(instalados, chamados(comChamado))).toEqual([]);
    // Com 20 instalados a taxa é 0,3, e entra (sem base, vale o mínimo).
    const vinte = parque(20, 3);
    expect(D(vinte, chamados(vinte.slice(0, 6)))).toHaveLength(1);
  });

  it('a base é só dos outros modelos da mesma categoria; ativo sem fabricante ou modelo fica fora da conta', () => {
    const as = parque(6, 3);
    const cs = chamados(as);
    // Muitos chamados em outra categoria e em ativos sem modelo: não mexem na base.
    const outraCategoria = outros(10).map((a) => ({
      ...a,
      id: `x${a.id}`,
      hotelId: 'h0',
      categoriaId: 'bomba',
    }));
    const semModelo: AtivoAnalisado[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      hotelId: 'h0',
      categoriaId: 'hvac',
      fabricante: null,
      modelo: null,
    }));
    const ruido = [...chamados(outraCategoria, 3), ...chamados(semModelo, 3)];
    expect(D([...as, ...outraCategoria, ...semModelo], [...cs, ...ruido])).toHaveLength(1);
  });

  it('a regra desligada pela política não gera sinal, e os mínimos vêm da política', () => {
    const as = parque(6, 3);
    const cs = chamados(as);
    expect(
      D(as, cs, {
        ...PADRAO_SISTEMICO,
        mesmoModelo: { ...PADRAO_SISTEMICO.mesmoModelo, ativa: false },
      }),
    ).toEqual([]);
    const m = PADRAO_SISTEMICO.mesmoModelo;
    expect(D(as, cs, { ...PADRAO_SISTEMICO, mesmoModelo: { ...m, minHoteis: 4 } })).toEqual([]);
    expect(D(as, cs, { ...PADRAO_SISTEMICO, mesmoModelo: { ...m, minChamados: 7 } })).toEqual([]);
    expect(D(as, cs, { ...PADRAO_SISTEMICO, mesmoModelo: { ...m, minAtivos: 7 } })).toEqual([]);
    expect(
      D(as, cs, {
        ...PADRAO_SISTEMICO,
        mesmoModelo: { ...m, minHoteis: 2, minChamados: 3, minAtivos: 3 },
      }),
    ).toHaveLength(1);
  });

  it('só o mesmo modelo vem ligado: as outras quatro regras ficam desligadas no padrão', () => {
    expect(
      Object.fromEntries(
        (
          ['mesmoModelo', 'mesmoAndar', 'mesmaAreaComum', 'mesmoFornecedor', 'crescimento'] as const
        ).map((k) => [k, PADRAO_SISTEMICO[k].ativa]),
      ),
    ).toEqual({
      mesmoModelo: true,
      mesmoAndar: false,
      mesmaAreaComum: false,
      mesmoFornecedor: false,
      crescimento: false,
    });
  });
});

describe('regras desligadas por padrão (v2): o mesmo andar e o crescimento', () => {
  it('com o padrão não geram sinal; ligadas pela política, geram', () => {
    const locais: LocalAnalisado[] = Array.from({ length: 8 }, (_, i) => ({
      id: `uh${i}`,
      hotelId: 'h1',
      andar: '3',
    }));
    const cs = locais.map((l, i) =>
      corretiva({ localId: l.id, ativoId: null, codigoFalha: 'agua_fria', abertaEm: dia(-i) }),
    );
    expect(detectar({ corretivas: cs, ativos: [], locais }, agora, PADRAO_SISTEMICO)).toEqual([]);
    const ligado = detectar({ corretivas: cs, ativos: [], locais }, agora, todasAsRegras);
    expect(ligado.map((s) => s.regra)).toContain('mesmo_andar');

    const crescendo = [-35, -40, -45, -50, -1, -3, -5, -7, -9, -11, -13, -15].map((d, i) =>
      corretiva({ localId: `l${i}`, ativoId: null, codigoFalha: 'vazamento', abertaEm: dia(d) }),
    );
    expect(
      detectar({ corretivas: crescendo, ativos: [], locais: [] }, agora, PADRAO_SISTEMICO),
    ).toEqual([]);
    expect(
      detectar({ corretivas: crescendo, ativos: [], locais: [] }, agora, todasAsRegras).map(
        (s) => s.regra,
      ),
    ).toEqual(['crescimento_categoria']);
  });
});

describe('crescimento da mesma falha no hotel', () => {
  const em = (dias: readonly number[]) =>
    dias.map((d, i) =>
      corretiva({ localId: `l${i}`, ativoId: null, codigoFalha: 'vazamento', abertaEm: dia(d) }),
    );

  it('de 4 para 8 em 30 dias → +100%, possível problema sistêmico', () => {
    const corretivas = em([-35, -40, -45, -50, -1, -3, -5, -7, -9, -11, -13, -15]);
    const [sinal] = detectarSistemicos({ corretivas, ativos: [], locais: [] }, agora);
    expect(sinal).toMatchObject({
      regra: 'crescimento_categoria',
      chave: { hotelId: 'h1', falha: 'vazamento' },
      evidencia: { quantidade: 8, anterior: 4, variacaoPercentual: 100 },
    });
  });

  it('sem nada na janela anterior não há base, e crescimento pequeno não conta', () => {
    expect(
      detectarSistemicos(
        { corretivas: em([-1, -2, -3, -4, -5, -6]), ativos: [], locais: [] },
        agora,
      ),
    ).toEqual([]);
    expect(
      detectarSistemicos(
        { corretivas: em([-35, -40, -45, -50, -1, -2, -3, -4, -5]), ativos: [], locais: [] },
        agora,
      ),
    ).toEqual([]);
  });
});

describe('rótulos do sistêmico v2', () => {
  const regras = [
    'mesmo_modelo',
    'mesmo_andar',
    'mesma_area_comum',
    'mesmo_fornecedor',
    'crescimento_categoria',
  ];

  it.each(IDIOMAS)(
    '%s: toda regra e a evidência do mesmo modelo formatam pelo catálogo',
    (idioma) => {
      const { t } = criarTradutor(idioma);
      for (const regra of regras)
        expect(t('inteligencia.sistemico.regra', { regra })).not.toMatch(/[{}]|^$/);
      const texto = t('inteligencia.sistemico.evidencia.mesmo_modelo', {
        quantidade: 6,
        distintos: 6,
        hoteis: 3,
        janelaDias: 90,
        taxa: 1,
        base: 0.5,
      });
      expect(texto).not.toMatch(/[{}]/);
      expect(texto).toContain('90');
      expect(texto).toMatch(/0[.,]5/);
    },
  );

  it('pt-BR: o mesmo modelo não fala mais em falha', () => {
    const { t } = criarTradutor('pt-BR');
    expect(t('inteligencia.sistemico.regra', { regra: 'mesmo_modelo' })).toBe(
      'Mesmo modelo com muitos chamados',
    );
    expect(
      t('inteligencia.sistemico.evidencia.mesmo_modelo', {
        quantidade: 6,
        distintos: 6,
        hoteis: 3,
        janelaDias: 90,
        taxa: 1,
        base: 0.5,
      }),
    ).toBe(
      '6 chamados em 6 ativos do mesmo modelo, em 3 hotéis, nos últimos 90 dias: 1 por ativo, contra 0,5 nos outros modelos da mesma categoria',
    );
  });
});
