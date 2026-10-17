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
  type ReclamacaoAnalisada,
  VERSAO_SISTEMICO,
  chaveDeModelo,
  configSistemicoValida,
  explicacaoDoSinal,
  regraDasReclamacoes,
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
  /**
   * Os mínimos da v2 e da v3, sem os da população (v4, no bloco seguinte):
   * estes casos têm parques pequenos de propósito, para isolar cada mínimo.
   */
  const semPopulacao: ConfigSistemico = {
    ...PADRAO_SISTEMICO,
    mesmoModelo: {
      ...PADRAO_SISTEMICO.mesmoModelo,
      minAtivos: 5,
      minPopulacao: 1,
      percentualMinimoAfetado: 0,
    },
  };
  /** Outro modelo na categoria, sem chamado: sem ele, a regra não dispara (10/10/2026). */
  const semChamado: AtivoAnalisado = {
    id: 'base',
    hotelId: 'h0',
    categoriaId: 'hvac',
    fabricante: 'Daikin',
    modelo: 'D1',
  };
  const D = (
    as: readonly AtivoAnalisado[],
    cs: ReturnType<typeof corretiva>[],
    c = semPopulacao,
    comOutroModelo = true,
  ) =>
    detectar(
      { corretivas: cs, ativos: comOutroModelo ? [...as, semChamado] : as, locais: [] },
      agora,
      c,
    ).filter((s) => s.regra === 'mesmo_modelo');
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

  it('o padrão é o aprovado: 3 hotéis, 6 chamados em 90 dias, 3 ativos, população de 10 com 30% afetado, dobro da base e mínimo 0,3', () => {
    expect(VERSAO_SISTEMICO).toBe(5);
    expect(PADRAO_SISTEMICO.mesmoModelo).toEqual({
      ativa: true,
      minHoteis: 3,
      minChamados: 6,
      minAtivos: 3,
      minPopulacao: 10,
      percentualMinimoAfetado: 30,
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
      versao: 5,
      chave: { categoriaId: 'hvac', modelo: 'carrier|xpower 12' },
      evidencia: {
        quantidade: 6,
        distintos: 6,
        janelaDias: 90,
        hotelIds: ['h0', 'h1', 'h2'],
        ativosDoModelo: 6,
        percentualAfetado: 100,
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
    const noLimite = D([...as, ...base], [...cs, ...chamados(base.slice(0, 5))], undefined, false);
    expect(noLimite).toHaveLength(1);
    expect(noLimite[0]?.evidencia).toMatchObject({ taxaPorAtivo: 1, basePorAtivo: 0.5 });
    // Base de 6 em 10 = 0,6; o dobro é 1,2, e a taxa de 1,0 não passa.
    expect(D([...as, ...base], [...cs, ...chamados(base.slice(0, 6))], undefined, false)).toEqual(
      [],
    );
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
        ...semPopulacao,
        mesmoModelo: { ...semPopulacao.mesmoModelo, ativa: false },
      }),
    ).toEqual([]);
    const m = semPopulacao.mesmoModelo;
    expect(D(as, cs, { ...semPopulacao, mesmoModelo: { ...m, minHoteis: 4 } })).toEqual([]);
    expect(D(as, cs, { ...semPopulacao, mesmoModelo: { ...m, minChamados: 7 } })).toEqual([]);
    expect(D(as, cs, { ...semPopulacao, mesmoModelo: { ...m, minAtivos: 7 } })).toEqual([]);
    expect(
      D(as, cs, {
        ...semPopulacao,
        mesmoModelo: { ...m, minHoteis: 2, minChamados: 3, minAtivos: 3 },
      }),
    ).toHaveLength(1);
  });

  it('sem outro modelo instalado na categoria, a regra não dispara', () => {
    const as = parque(6, 3);
    const cs = chamados(as);
    expect(D(as, cs, semPopulacao, false)).toEqual([]);
    // Outro modelo em outra categoria, ou sem fabricante e modelo, não é comparação.
    const outraCategoria = { ...semChamado, categoriaId: 'bomba' };
    const semModelo = { ...semChamado, fabricante: null, modelo: null };
    expect(D([...as, outraCategoria, semModelo], cs, semPopulacao, false)).toEqual([]);
    expect(D(as, cs)).toHaveLength(1);
  });

  it('ativo instalado é o que esteve ativo na janela: o baixado antes do início não conta', () => {
    // 6 chamados em 30 ativos: 0,2, abaixo de 0,3. Com 10 baixados antes da janela, 6 em 20: 0,3.
    const trinta = parque(30, 3);
    const comChamado = trinta.slice(0, 6);
    const baixar = (quando: Date) =>
      trinta.map((a, i) => (i >= 20 ? { ...a, desativadoEm: quando } : a));
    expect(D(trinta, chamados(comChamado))).toEqual([]);
    const sinais = D(baixar(dia(-100)), chamados(comChamado));
    expect(sinais).toHaveLength(1);
    expect(sinais[0]?.evidencia).toMatchObject({ ativosDoModelo: 20, taxaPorAtivo: 0.3 });
    // Baixado no meio da janela conta inteiro (1.0).
    expect(D(baixar(dia(-50)), chamados(comChamado))).toEqual([]);
  });

  it('o outro modelo baixado antes da janela não serve de base', () => {
    const as = parque(6, 3);
    const baixado = { ...semChamado, desativadoEm: dia(-120) };
    expect(D([...as, baixado], chamados(as), semPopulacao, false)).toEqual([]);
    const naJanela = { ...semChamado, desativadoEm: dia(-30) };
    expect(D([...as, naJanela], chamados(as), semPopulacao, false)).toHaveLength(1);
  });

  it('os 3 hotéis são os com chamado contado: ter o modelo instalado não basta', () => {
    // 6 ativos com chamado em 2 hotéis e o mesmo modelo instalado num terceiro, sem chamado.
    const comChamado = parque(6, 2);
    const noTerceiro: AtivoAnalisado = {
      ...(comChamado[0] as AtivoAnalisado),
      id: 't1',
      hotelId: 'h9',
    };
    expect(D([...comChamado, noTerceiro], chamados(comChamado))).toEqual([]);
  });

  it('fabricante e modelo sem maiúsculas, acentos e espaços extras', () => {
    expect(chaveDeModelo({ fabricante: '  Mídea ', modelo: 'Split   Inverter  12' })).toBe(
      'midea|split inverter 12',
    );
    expect(chaveDeModelo({ fabricante: 'MIDEA', modelo: 'split inverter 12' })).toBe(
      'midea|split inverter 12',
    );
    expect(chaveDeModelo({ fabricante: 'Ar Condicionado Pólo', modelo: 'Ç-200' })).toBe(
      'ar condicionado polo|c-200',
    );
    expect(chaveDeModelo({ fabricante: 'Midea', modelo: '   ' })).toBeNull();
    expect(chaveDeModelo({ fabricante: null, modelo: 'X' })).toBeNull();
    // Grafias diferentes do mesmo modelo, em 3 hotéis, viram um sinal só.
    const grafias = ['Mídea', 'MIDEA', ' midea ', 'Midea', 'MÍDEA', 'midéa'];
    const as: AtivoAnalisado[] = grafias.map((fabricante, i) => ({
      id: `g${i}`,
      hotelId: `h${i % 3}`,
      categoriaId: 'hvac',
      fabricante,
      modelo: i % 2 ? 'Split  Inverter' : 'split inverter',
    }));
    const sinais = D(as, chamados(as));
    expect(sinais).toHaveLength(1);
    expect(sinais[0]?.chave).toEqual({ categoriaId: 'hvac', modelo: 'midea|split inverter' });
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

describe('mesmo modelo, versão 4: população mínima e percentual afetado (Kaio, 15/10/2026)', () => {
  /** `n` ativos do modelo em 3 hotéis, e outro modelo na categoria, sem chamado, para a base. */
  const parque = (n: number): AtivoAnalisado[] => [
    ...Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      hotelId: `h${i % 3}`,
      categoriaId: 'hvac',
      fabricante: 'Polar',
      modelo: 'Inverter 18000',
    })),
    { id: 'base', hotelId: 'h0', categoriaId: 'hvac', fabricante: 'Daikin', modelo: 'D1' },
  ];
  /** Dois chamados em cada um dos `afetados` primeiros ativos do parque. */
  const chamados = (as: readonly AtivoAnalisado[], afetados: number) =>
    as
      .slice(0, afetados)
      .flatMap((a, i) =>
        [0, 1].map((v) =>
          corretiva({ hotelId: a.hotelId, ativoId: a.id, abertaEm: dia(-1 - i - v * 30) }),
        ),
      );
  const D = (
    as: readonly AtivoAnalisado[],
    cs: ReturnType<typeof corretiva>[],
    c = PADRAO_SISTEMICO,
  ) =>
    detectar({ corretivas: cs, ativos: as, locais: [] }, agora, c).filter(
      (s) => s.regra === 'mesmo_modelo',
    );

  it('população de 9 não dispara, nem com todos afetados; com 10, dispara', () => {
    const nove = parque(9);
    expect(D(nove, chamados(nove, 9))).toEqual([]);
    const dez = parque(10);
    const sinais = D(dez, chamados(dez, 10));
    expect(sinais).toHaveLength(1);
    expect(sinais[0]?.evidencia).toMatchObject({
      distintos: 10,
      ativosDoModelo: 10,
      percentualAfetado: 100,
    });
  });

  it('30% da população no limite entra; abaixo, não', () => {
    // 3 de 10 ativos = 30%: entra.
    const dez = parque(10);
    const [sinal] = D(dez, chamados(dez, 3));
    expect(sinal?.evidencia).toMatchObject({
      distintos: 3,
      ativosDoModelo: 10,
      percentualAfetado: 30,
    });
    // 3 de 11 = 27,3%: fica de fora, mesmo com a taxa acima do mínimo.
    const onze = parque(11);
    expect(D(onze, chamados(onze, 3))).toEqual([]);
    // A conta é exata: 299 de 1000 (29,9%) fica de fora; 300, entra.
    const mil = parque(1000);
    const muitos = (n: number) =>
      mil
        .slice(0, n)
        .map((a, i) =>
          corretiva({ hotelId: a.hotelId, ativoId: a.id, abertaEm: dia(-1 - (i % 80)) }),
        );
    const taxaBaixa = {
      ...PADRAO_SISTEMICO,
      mesmoModelo: { ...PADRAO_SISTEMICO.mesmoModelo, taxaMinima: 0 },
    };
    expect(D(mil, muitos(299), taxaBaixa)).toEqual([]);
    expect(D(mil, muitos(300), taxaBaixa)).toHaveLength(1);
  });

  it('pelo menos 3 ativos distintos com chamado', () => {
    // Com 2 hotéis no mínimo, 2 ativos com 3 chamados cada não bastam.
    const dez = parque(10);
    const doisHoteis = {
      ...PADRAO_SISTEMICO,
      mesmoModelo: { ...PADRAO_SISTEMICO.mesmoModelo, minHoteis: 2, percentualMinimoAfetado: 0 },
    };
    const tres = (a: AtivoAnalisado) =>
      [0, 1, 2].map((v) =>
        corretiva({ hotelId: a.hotelId, ativoId: a.id, abertaEm: dia(-1 - v * 20) }),
      );
    expect(
      D(dez, [...tres(dez[0] as AtivoAnalisado), ...tres(dez[1] as AtivoAnalisado)], doisHoteis),
    ).toEqual([]);
  });

  it('a política gravada antes da v4, sem os campos novos, usa o padrão deles', () => {
    const semOsNovos: Partial<ConfigSistemico['mesmoModelo']> = { ...PADRAO_SISTEMICO.mesmoModelo };
    delete semOsNovos.minPopulacao;
    delete semOsNovos.percentualMinimoAfetado;
    const antiga = {
      ...PADRAO_SISTEMICO,
      mesmoModelo: semOsNovos as ConfigSistemico['mesmoModelo'],
    };
    const nove = parque(9);
    expect(D(nove, chamados(nove, 9), antiga)).toEqual([]);
    const dez = parque(10);
    expect(D(dez, chamados(dez, 10), antiga)).toHaveLength(1);
  });
});

/** O hotel h1 com chamado desde 200 dias atrás: duas janelas completas de dados (v4). */
const hotelAntigo = new Map([['h1', dia(-200)]]);

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
    const comHistoria = { ativos: [], locais: [], primeiroChamadoPorHotel: hotelAntigo };
    expect(detectar({ corretivas: crescendo, ...comHistoria }, agora, PADRAO_SISTEMICO)).toEqual(
      [],
    );
    expect(
      detectar({ corretivas: crescendo, ...comHistoria }, agora, todasAsRegras).map((s) => s.regra),
    ).toEqual(['crescimento_categoria']);
  });
});

describe('crescimento da mesma falha no hotel', () => {
  const em = (dias: readonly number[]) =>
    dias.map((d, i) =>
      corretiva({ localId: `l${i}`, ativoId: null, codigoFalha: 'vazamento', abertaEm: dia(d) }),
    );

  const D = (corretivas: ReturnType<typeof corretiva>[], primeiro = hotelAntigo) =>
    detectarSistemicos(
      { corretivas, ativos: [], locais: [], primeiroChamadoPorHotel: primeiro },
      agora,
    );

  it('de 4 para 8 em 30 dias → +100%, possível problema sistêmico', () => {
    const corretivas = em([-35, -40, -45, -50, -1, -3, -5, -7, -9, -11, -13, -15]);
    const [sinal] = D(corretivas);
    expect(sinal).toMatchObject({
      regra: 'crescimento_categoria',
      chave: { hotelId: 'h1', falha: 'vazamento' },
      evidencia: { quantidade: 8, anterior: 4, variacaoPercentual: 100 },
    });
  });

  it('sem nada na janela anterior não há base, e crescimento pequeno não conta', () => {
    expect(D(em([-1, -2, -3, -4, -5, -6]))).toEqual([]);
    expect(D(em([-35, -40, -45, -50, -1, -2, -3, -4, -5]))).toEqual([]);
  });

  describe('v4: só depois de duas janelas completas de dados do hotel (Kaio, 15/10/2026)', () => {
    const crescendo = [-35, -40, -45, -50, -1, -3, -5, -7, -9, -11, -13, -15];

    it('o hotel com o primeiro chamado há menos de 60 dias não tem crescimento', () => {
      expect(D(em(crescendo), new Map([['h1', dia(-59)]]))).toEqual([]);
      // Sem o mapa do job, vale a corretiva mais antiga da entrada: 50 dias.
      expect(D(em(crescendo), new Map())).toEqual([]);
    });

    it('no limite (exatamente 60 dias) já vale; o mais antigo entre o mapa e a corretiva conta', () => {
      expect(D(em(crescendo), new Map([['h1', dia(-60)]]))).toHaveLength(1);
      // O mapa sem o hotel: a corretiva de 70 dias atrás, de outra falha, basta.
      const antiga = corretiva({
        localId: 'lx',
        ativoId: null,
        codigoFalha: 'outra',
        abertaEm: dia(-70),
      });
      expect(D([...em(crescendo), antiga], new Map())).toHaveLength(1);
    });

    it('a contagem é por hotel: o hotel novo espera, o antigo segue', () => {
      const doH2 = em(crescendo).map((c) => ({ ...c, id: `h2-${c.id}`, hotelId: 'h2' }));
      const sinais = D(
        [...em(crescendo), ...doH2],
        new Map([
          ['h1', dia(-200)],
          ['h2', dia(-50)],
        ]),
      );
      expect(sinais.map((s) => s.chave.hotelId)).toEqual(['h1']);
    });

    it('com janela de 45 dias, pede 90 dias de dados', () => {
      const cfg = {
        ...todasAsRegras,
        crescimento: { ...todasAsRegras.crescimento, janelaDias: 45 },
      };
      const cs = em([-50, -55, -60, -65, -1, -3, -5, -7, -9, -11, -13, -15]);
      const comPrimeiro = (d: number) =>
        detectar(
          {
            corretivas: cs,
            ativos: [],
            locais: [],
            primeiroChamadoPorHotel: new Map([['h1', dia(d)]]),
          },
          agora,
          cfg,
        ).filter((s) => s.regra === 'crescimento_categoria');
      expect(comPrimeiro(-89)).toEqual([]);
      expect(comPrimeiro(-90)).toHaveLength(1);
    });
  });
});

describe('rótulos do sistêmico v2', () => {
  const regras = [
    'mesmo_modelo',
    'mesmo_andar',
    'mesma_area_comum',
    'mesmo_fornecedor',
    'crescimento_categoria',
    'reclamacoes_categoria',
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
        populacao: 12,
        hoteis: 3,
        janelaDias: 90,
        taxa: 1,
        base: 0.5,
      });
      expect(texto).not.toMatch(/[{}]/);
      expect(texto).toContain('90');
      expect(texto).toContain('12');
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
        populacao: 12,
        hoteis: 3,
        janelaDias: 90,
        taxa: 1,
        base: 0.5,
      }),
    ).toBe(
      '6 chamados em 6 ativos do mesmo modelo (de 12 instalados), em 3 hotéis, nos últimos 90 dias: 1 por ativo, contra 0,5 nos outros modelos da mesma categoria',
    );
  });
});

describe('reclamações de hóspede (v5, ADR-047)', () => {
  const r = (
    n: number,
    p: Partial<ReclamacaoAnalisada> & { uhId?: string | null } = {},
  ): ReclamacaoAnalisada => ({
    id: `s${n}`,
    hotelId: 'h1',
    categoriaId: 'hidraulica',
    uhId: `uh${n}`,
    ocorridoEm: dia(-n),
    ...p,
  });
  const so = (reclamacoes: ReclamacaoAnalisada[], config = PADRAO_SISTEMICO) =>
    detectar({ corretivas: [], ativos: [], locais: [], reclamacoes }, agora, config).filter(
      (s) => s.regra === 'reclamacoes_categoria',
    );

  it('o padrão: ligada, 3 reclamações de 2 UHs em 14 dias', () => {
    expect(PADRAO_SISTEMICO.reclamacoes).toEqual({
      ativa: true,
      minReclamacoes: 3,
      minUhs: 2,
      janelaDias: 14,
    });
  });

  it('PRD 37: água fria em várias UHs → possível problema, com as reclamações e as UHs', () => {
    const sinais = so([r(1), r(2), r(3, { uhId: 'uh1' }), r(4, { uhId: null })]);
    expect(sinais).toEqual([
      {
        regra: 'reclamacoes_categoria',
        situacao: 'possivel',
        versao: 5,
        chave: { hotelId: 'h1', categoriaId: 'hidraulica' },
        evidencia: {
          quantidade: 4,
          distintos: 2,
          janelaDias: 14,
          hotelIds: ['h1'],
          corretivaIds: [],
          sinalIds: ['s1', 's2', 's3', 's4'],
        },
      },
    ]);
    expect(explicacaoDoSinal(sinais[0] as (typeof sinais)[number])).toEqual({
      chave: 'inteligencia.sistemico.evidencia.reclamacoes_categoria',
      valores: { quantidade: 4, uhs: 2, janelaDias: 14 },
    });
  });

  it('abaixo dos mínimos, fora da janela, em outra categoria ou outro hotel: não dispara', () => {
    expect(so([r(1), r(2)])).toEqual([]);
    expect(so([r(1), r(2, { uhId: 'uh1' }), r(3, { uhId: 'uh1' })])).toEqual([]);
    expect(so([r(1), r(2), r(15)])).toEqual([]);
    expect(so([r(1), r(2), r(3, { categoriaId: 'ar' })])).toEqual([]);
    expect(so([r(1), r(2), r(3, { hotelId: 'h2' })])).toEqual([]);
    expect(so([r(1), r(2), r(3, { ocorridoEm: dia(1) })])).toEqual([]);
  });

  it('desligada pela política, não dispara; a política gravada antes da v5 vale com o padrão', () => {
    const desligada = {
      ...PADRAO_SISTEMICO,
      reclamacoes: { ...regraDasReclamacoes(PADRAO_SISTEMICO), ativa: false },
    };
    expect(so([r(1), r(2), r(3)], desligada)).toEqual([]);
    const antes: ConfigSistemico = { ...PADRAO_SISTEMICO };
    delete antes.reclamacoes;
    expect(regraDasReclamacoes(antes)).toEqual(PADRAO_SISTEMICO.reclamacoes);
    expect(so([r(1), r(2), r(3)], antes)).toHaveLength(1);
    expect(configSistemicoValida(antes)).toBe(true);
    expect(
      configSistemicoValida({
        ...PADRAO_SISTEMICO,
        reclamacoes: { ativa: true, minReclamacoes: 0, minUhs: 2, janelaDias: 14 },
      }),
    ).toBe(false);
  });

  it.each(IDIOMAS)('%s: a evidência das reclamações formata pelo catálogo', (idioma) => {
    const { t } = criarTradutor(idioma);
    const texto = t('inteligencia.sistemico.evidencia.reclamacoes_categoria', {
      quantidade: 4,
      uhs: 2,
      janelaDias: 14,
    });
    expect(texto).not.toMatch(/[{}]/);
    expect(texto).toContain('14');
  });

  it('pt-BR: a frase das reclamações', () => {
    const { t } = criarTradutor('pt-BR');
    expect(
      t('inteligencia.sistemico.evidencia.reclamacoes_categoria', {
        quantidade: 4,
        uhs: 2,
        janelaDias: 14,
      }),
    ).toBe('4 reclamações de hóspede da mesma categoria, de 2 UHs diferentes, nos últimos 14 dias');
  });
});
