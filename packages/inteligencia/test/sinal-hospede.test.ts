// O sinal do hóspede (ADR-047, a 1.5 sem IA; Cesar e Kaio, 16/10/2026): a
// validação da linha do CSV, a importação por hotel e a classificação à mão.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type ClassificacaoGravada,
  type ImportacaoGravada,
  LIMITE_DA_IMPORTACAO,
  type LinhaDoCsv,
  type PedidoDeClassificacao,
  LIMITE_DA_FILA,
  type PortasDaFilaDoSinal,
  type ReferenciasDaClassificacao,
  type SinalDaFila,
  type SituacaoDaFila,
  chaveDoSinal,
  classificarSinal,
  dataDaAvaliacao,
  ehSituacaoDaFila,
  fonteNormalizada,
  importarSinais,
  listarSinais,
  validarLinha,
} from '../src/index';

const agora = new Date('2026-10-16T12:00:00Z');

const atribuicao = (papel: Papel, escopo: Escopo): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const gerenteH6 = [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h6' })];

const linha = (l: LinhaDoCsv = {}): LinhaDoCsv => ({
  id_externo: 'r-1',
  data: '2026-10-10',
  fonte: 'google',
  nota: '2',
  escala: '5',
  texto: 'Ar do 304 muito barulhento',
  idioma: 'pt-BR',
  uh: '304',
  ...l,
});

interface Gravado {
  importacoes: ImportacaoGravada[];
  classificacoes: ClassificacaoGravada[];
  filas: { hotelId: string; situacao: SituacaoDaFila; limite: number }[];
}

function emMemoria(
  atribuicoes: Atribuicao[],
  opcoes: {
    existentes?: string[];
    referencias?: Partial<ReferenciasDaClassificacao>;
    fila?: SinalDaFila[];
  } = {},
): PortasDaFilaDoSinal & Gravado {
  const importacoes: ImportacaoGravada[] = [];
  const classificacoes: ClassificacaoGravada[] = [];
  const filas: Gravado['filas'] = [];
  const nao = async (): Promise<never> => {
    throw new Error('não usada');
  };
  const existentes = new Set(opcoes.existentes ?? []);
  return {
    importacoes,
    classificacoes,
    filas,
    modulos: async () => [{ modulo: 'inteligencia', inicio: new Date('2026-01-01'), fim: null }],
    atribuicoes: async () => atribuicoes,
    visibilidade: async () => ({
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    }),
    fuso: async () => 'America/Sao_Paulo',
    contagens: nao,
    insights: nao,
    insight: nao,
    ligados: nao,
    chamados: nao,
    decidir: nao,
    ativo: nao,
    metricasDoAtivo: nao,
    insightsDoEscopo: nao,
    nomes: async (p) => ({
      hoteis: {},
      bandeiras: {},
      pessoas: Object.fromEntries(p.usuarioIds.map((id) => [id, `Pessoa ${id}`])),
      ativos: Object.fromEntries(p.ativoIds.map((id) => [id, `Ativo ${id}`])),
    }),
    sinaisDoHotel: async (hotelId, situacao, limite) => {
      filas.push({ hotelId, situacao, limite });
      return (opcoes.fila ?? []).slice(0, limite);
    },
    hotelDoSinal: async (id) => (['h1', 'h6'].includes(id) ? { id, bandeiraId: null } : null),
    gravarSinais: async (i) => {
      importacoes.push(i);
      return {
        loteId: 'lote-1',
        inseridos: i.sinais.map(chaveDoSinal).filter((c) => !existentes.has(c)),
      };
    },
    sinalParaClassificar: async (id) =>
      id === 's6'
        ? { id, hotelId: 'h6', bandeiraId: null, versao: 3 }
        : id === 's1'
          ? { id, hotelId: 'h1', bandeiraId: null, versao: 1 }
          : null,
    referenciasDaClassificacao: async () => ({
      ativo: { id: 'a6', hotelId: 'h6', categoriaId: 'cat-ar', desativadoEm: null },
      uh: { id: 'uh304', hotelId: 'h6', tipo: 'uh' },
      categoria: { id: 'cat-ar' },
      ...opcoes.referencias,
    }),
    classificar: async (c) => {
      classificacoes.push(c);
      return { versao: c.versaoEsperada + 1 };
    },
  };
}

describe('a linha do CSV', () => {
  it('normaliza a linha válida: a fonte em código, a nota com vírgula e o dia ao meio-dia UTC', () => {
    const v = validarLinha(linha({ fonte: ' Google Reviews ', nota: '4,5' }), agora);
    expect(v).toEqual({
      ok: true,
      sinal: {
        fonte: 'google_reviews',
        idExterno: 'r-1',
        ocorridoEm: new Date('2026-10-10T12:00:00Z'),
        nota: 4.5,
        escala: 5,
        texto: 'Ar do 304 muito barulhento',
        idioma: 'pt-BR',
        uhCitada: '304',
      },
    });
  });

  it('a fonte sem acento e o instante com fuso', () => {
    expect(fonteNormalizada('Pesquisa Própria')).toBe('pesquisa_propria');
    expect(fonteNormalizada('google/maps')).toBeNull();
    expect(dataDaAvaliacao('2026-10-10T09:30-03:00')).toEqual(new Date('2026-10-10T12:30:00Z'));
    expect(dataDaAvaliacao('2026-10-10T09:30')).toBeNull();
    expect(dataDaAvaliacao('2026-02-30')).toBeNull();
    expect(dataDaAvaliacao('10/10/2026')).toBeNull();
  });

  it('só texto ou só nota com escala bastam; sem os dois, sem conteúdo', () => {
    expect(validarLinha(linha({ nota: '', escala: '' }), agora).ok).toBe(true);
    expect(validarLinha(linha({ texto: '' }), agora).ok).toBe(true);
    expect(validarLinha(linha({ texto: '', nota: '', escala: '' }), agora)).toEqual({
      ok: false,
      erro: 'sem_conteudo',
    });
  });

  it.each([
    [{ id_externo: ' ' }, 'id_externo_ausente'],
    [{ id_externo: 'x'.repeat(201) }, 'id_externo_longo'],
    [{ data: '' }, 'data_invalida'],
    [{ data: '2026-10-18' }, 'data_no_futuro'],
    [{ fonte: '' }, 'fonte_invalida'],
    [{ nota: '6' }, 'nota_invalida'],
    [{ nota: 'ótimo' }, 'nota_invalida'],
    [{ escala: '' }, 'nota_invalida'],
    [{ nota: '', escala: '5' }, 'nota_invalida'],
    [{ escala: '0' }, 'escala_invalida'],
    [{ escala: '5,5' }, 'escala_invalida'],
    [{ escala: '101' }, 'escala_invalida'],
    [{ texto: 'x'.repeat(4001) }, 'texto_longo'],
    [{ idioma: 'português' }, 'idioma_invalido'],
    [{ uh: 'x'.repeat(41) }, 'uh_longa'],
  ] as const)('%o → %s', (troca, erro) => {
    expect(validarLinha(linha(troca), agora)).toEqual({ ok: false, erro });
  });
});

describe('importar no Intelligence', () => {
  it('conta, por linha, o que entrou, o repetido e o erro, e grava só as válidas', async () => {
    const p = emMemoria(gerenteH6, { existentes: ['booking|b-9'] });
    const r = await importarSinais(
      p,
      {
        hotelId: 'h6',
        usuarioId: 'u1',
        linhas: [
          linha(),
          linha({ id_externo: 'r-2', data: 'ontem' }),
          linha(),
          linha({ id_externo: 'b-9', fonte: 'Booking' }),
        ],
      },
      agora,
    );
    expect(r).toEqual({
      loteId: 'lote-1',
      entraram: 1,
      repetidas: 1,
      erros: 2,
      linhas: [
        { linha: 1, resultado: 'entrou' },
        { linha: 2, resultado: 'erro', erro: 'data_invalida' },
        { linha: 3, resultado: 'erro', erro: 'repetida_no_arquivo' },
        { linha: 4, resultado: 'repetida' },
      ],
    });
    expect(p.importacoes).toHaveLength(1);
    expect(p.importacoes[0]).toMatchObject({ hotelId: 'h6', importadoPor: 'u1', em: agora });
    expect(p.importacoes[0]?.sinais.map(chaveDoSinal)).toEqual(['google|r-1', 'booking|b-9']);
  });

  it('sem nenhuma linha válida, nada é gravado', async () => {
    const p = emMemoria(gerenteH6);
    const r = await importarSinais(
      p,
      { hotelId: 'h6', usuarioId: 'u1', linhas: [linha({ fonte: '' })] },
      agora,
    );
    expect(r).toMatchObject({ loteId: null, entraram: 0, erros: 1 });
    expect(p.importacoes).toEqual([]);
  });

  it('o hotel fora de quem decide insight não existe para quem pede', async () => {
    const p = emMemoria(gerenteH6);
    await expect(
      importarSinais(p, { hotelId: 'h1', usuarioId: 'u1', linhas: [linha()] }, agora),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    await expect(
      importarSinais(p, { hotelId: 'h9', usuarioId: 'u1', linhas: [linha()] }, agora),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
  });

  it('a importação vazia e a grande demais são recusadas inteiras', async () => {
    const p = emMemoria(gerenteH6);
    await expect(
      importarSinais(p, { hotelId: 'h6', usuarioId: 'u1', linhas: [] }, agora),
    ).rejects.toMatchObject({ codigo: 'importacao_vazia' });
    const muitas = Array.from({ length: LIMITE_DA_IMPORTACAO + 1 }, (_, i) =>
      linha({ id_externo: `r-${i}` }),
    );
    await expect(
      importarSinais(p, { hotelId: 'h6', usuarioId: 'u1', linhas: muitas }, agora),
    ).rejects.toMatchObject({ codigo: 'importacao_grande', parametros: { limite: 1000 } });
  });

  it('o técnico não usa o Intelligence', async () => {
    const p = emMemoria([atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h6' })]);
    await expect(
      importarSinais(p, { hotelId: 'h6', usuarioId: 'u1', linhas: [linha()] }, agora),
    ).rejects.toMatchObject({ codigo: 'inteligencia_indisponivel' });
  });
});

describe('classificar a reclamação', () => {
  const pedido = (x: Partial<PedidoDeClassificacao> = {}): PedidoDeClassificacao => ({
    sinalId: 's6',
    usuarioId: 'u1',
    versao: 3,
    manutencao: true,
    categoriaId: null,
    uhId: 'uh304',
    ativoId: 'a6',
    ligacao: 'confirmada',
    ...x,
  });

  it('liga ao ativo, com a categoria do ativo quando a pessoa não escolheu', async () => {
    const p = emMemoria(gerenteH6);
    expect(await classificarSinal(p, pedido(), agora)).toEqual({ versao: 4 });
    expect(p.classificacoes).toEqual([
      {
        sinalId: 's6',
        versaoEsperada: 3,
        manutencao: true,
        categoriaId: 'cat-ar',
        uhId: 'uh304',
        ativoId: 'a6',
        ligacao: 'confirmada',
        classificadoPor: 'u1',
        em: agora,
      },
    ]);
  });

  it('não é manutenção: sem categoria e sem ativo, a UH pode ficar', async () => {
    const p = emMemoria(gerenteH6);
    await classificarSinal(
      p,
      pedido({ manutencao: false, ativoId: null, ligacao: 'sem_ligacao' }),
      agora,
    );
    expect(p.classificacoes[0]).toMatchObject({
      manutencao: false,
      categoriaId: null,
      uhId: 'uh304',
    });
    await expect(
      classificarSinal(
        p,
        pedido({ manutencao: false, ativoId: null, categoriaId: 'cat-ar', ligacao: 'sem_ligacao' }),
        agora,
      ),
    ).rejects.toMatchObject({ codigo: 'classificacao_sem_manutencao' });
  });

  it('a ligação acompanha o ativo', async () => {
    const p = emMemoria(gerenteH6);
    await expect(
      classificarSinal(p, pedido({ ligacao: 'sem_ligacao' }), agora),
    ).rejects.toMatchObject({ codigo: 'ligacao_sem_ativo' });
    await expect(
      classificarSinal(p, pedido({ ativoId: null, ligacao: 'possivel' }), agora),
    ).rejects.toMatchObject({ codigo: 'ligacao_sem_ativo' });
    await expect(
      classificarSinal(p, pedido({ ligacao: 'talvez' as 'possivel' }), agora),
    ).rejects.toMatchObject({ codigo: 'ligacao_invalida' });
  });

  it('o ativo, a UH e a categoria são do hotel da reclamação e coerentes', async () => {
    const casos: [Partial<ReferenciasDaClassificacao>, Partial<PedidoDeClassificacao>, string][] = [
      [{ ativo: null }, {}, 'ativo_nao_encontrado'],
      [
        { ativo: { id: 'a6', hotelId: 'h1', categoriaId: null, desativadoEm: null } },
        {},
        'ativo_nao_encontrado',
      ],
      [
        {
          ativo: {
            id: 'a6',
            hotelId: 'h6',
            categoriaId: null,
            desativadoEm: new Date('2026-09-01'),
          },
        },
        {},
        'ativo_baixado',
      ],
      [{}, { categoriaId: 'cat-agua' }, 'categoria_do_ativo'],
      [{ uh: { id: 'uh304', hotelId: 'h6', tipo: 'area_comum' } }, {}, 'uh_nao_encontrada'],
      [{ uh: null }, {}, 'uh_nao_encontrada'],
      [
        { categoria: null },
        { ativoId: null, ligacao: 'sem_ligacao', categoriaId: 'x' },
        'categoria_nao_encontrada',
      ],
    ];
    for (const [referencias, troca, codigo] of casos) {
      const p = emMemoria(gerenteH6, { referencias });
      await expect(classificarSinal(p, pedido(troca), agora)).rejects.toMatchObject({ codigo });
      expect(p.classificacoes).toEqual([]);
    }
  });

  it('a trava de versão e o hotel de quem decide', async () => {
    const p = emMemoria(gerenteH6);
    await expect(classificarSinal(p, pedido({ versao: 2 }), agora)).rejects.toMatchObject({
      codigo: 'conflito_de_versao',
    });
    await expect(classificarSinal(p, pedido({ sinalId: 's1' }), agora)).rejects.toMatchObject({
      codigo: 'sinal_nao_encontrado',
    });
    await expect(classificarSinal(p, pedido({ sinalId: 's9' }), agora)).rejects.toMatchObject({
      codigo: 'sinal_nao_encontrado',
    });
  });
});

const naFila = (s: Partial<SinalDaFila> = {}): SinalDaFila => ({
  id: 's6',
  hotelId: 'h6',
  fonte: 'google',
  idExterno: 'r-1',
  ocorridoEm: new Date('2026-10-10T12:00:00Z'),
  nota: 2,
  escala: 5,
  texto: 'Ar do 304 muito barulhento',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: '304',
  manutencao: null,
  categoriaId: null,
  uhId: null,
  ativoId: null,
  ligacao: 'sem_ligacao',
  classificadoEm: null,
  classificadoPor: null,
  importadoEm: new Date('2026-10-11T09:00:00Z'),
  versao: 1,
  chamadoId: null,
  ...s,
});

describe('a fila de classificação', () => {
  it('lê o recorte do hotel, com o nome do ativo e o de quem classificou', async () => {
    const p = emMemoria(gerenteH6, {
      fila: [
        naFila(),
        naFila({
          id: 's7',
          manutencao: true,
          ativoId: 'a6',
          ligacao: 'confirmada',
          classificadoPor: 'u1',
          classificadoEm: new Date('2026-10-12T10:00:00Z'),
        }),
      ],
    });
    const fila = await listarSinais(p, { hotelId: 'h6', situacao: 'todas' }, agora);
    expect(p.filas).toEqual([{ hotelId: 'h6', situacao: 'todas', limite: LIMITE_DA_FILA + 1 }]);
    expect(fila.sinais.map((s) => s.id)).toEqual(['s6', 's7']);
    expect(fila.limitada).toBe(false);
    expect(fila.nomes).toEqual({ ativos: { a6: 'Ativo a6' }, pessoas: { u1: 'Pessoa u1' } });
  });

  it('mostra até o limite e diz que há mais', async () => {
    const fila = Array.from({ length: LIMITE_DA_FILA + 1 }, (_, i) => naFila({ id: `s${i}` }));
    const r = await listarSinais(
      emMemoria(gerenteH6, { fila }),
      { hotelId: 'h6', situacao: 'pendentes' },
      agora,
    );
    expect(r.sinais).toHaveLength(LIMITE_DA_FILA);
    expect(r.limitada).toBe(true);
  });

  it('o hotel fora de quem decide insight não existe, e o técnico não usa o Intelligence', async () => {
    await expect(
      listarSinais(emMemoria(gerenteH6), { hotelId: 'h1', situacao: 'pendentes' }, agora),
    ).rejects.toMatchObject({ codigo: 'hotel_nao_encontrado' });
    const tecnico = [atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h6' })];
    await expect(
      listarSinais(emMemoria(tecnico), { hotelId: 'h6', situacao: 'pendentes' }, agora),
    ).rejects.toMatchObject({ codigo: 'inteligencia_indisponivel' });
  });

  it('as situações da fila', () => {
    expect(['pendentes', 'manutencao', 'fora', 'todas'].every(ehSituacaoDaFila)).toBe(true);
    expect(ehSituacaoDaFila('classificadas')).toBe(false);
  });
});
