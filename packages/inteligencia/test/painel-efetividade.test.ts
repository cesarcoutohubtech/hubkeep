// A efetividade no painel: as intervenções do ativo e as da seção da lista,
// para quem decide o insight do hotel do ativo (adendo ao ADR-033, 15/10/2026).
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoPainel,
  type InsightComEvidencia,
  type ChamadoDaEfetividade,
  DIAS_DAS_INTERVENCOES,
  LIMITE_DAS_INTERVENCOES,
  type LinhaDePolitica,
  PADRAO_EFETIVIDADE,
  type ParadaDoAtivo,
  type PortasDaEfetividade,
  efetividadeDoAtivo,
  efetividadeDoInsight,
  listarEfetividades,
} from '../src/index';

const DIA = 86_400_000;
const agora = new Date('2026-10-10T12:00:00Z');
const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);

const atribuicao = (papel: Papel, escopo: Escopo): Atribuicao => ({
  id: `a-${papel}`,
  usuarioId: 'u1',
  papel,
  escopo,
  validoAte: null,
  revogadoEm: null,
});

const ativo = (id: string, hotelId: string, bandeiraId: string | null = null): AtivoDoPainel => ({
  id,
  nome: `Ativo ${id}`,
  hotelId,
  bandeiraId,
  criticidade: null,
  desativadoEm: null,
  fuso: 'America/Sao_Paulo',
  dataCompra: null,
  garantiaAte: null,
});

let seq = 0;
const troca = (ativoId: string, hotelId: string, dias: number): ChamadoDaEfetividade => {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`,
    hotelId,
    bandeiraId: null,
    localId: 'l1',
    ativoId,
    abertaEm: antes(dias + 5),
    estado: 'concluido',
    impactoHospede: null,
    os: [
      {
        estado: 'concluida',
        criadaEm: antes(dias + 5),
        codigoFalha: null,
        executadoPor: 'equipe_interna',
        fornecedorId: null,
        custoInformado: null,
        codigoSolucaoId: 'k-troca',
        codigoSolucaoChave: 'solucao_troca_do_equipamento',
        transicoes: [{ acao: 'concluir', para: 'concluida', quando: antes(dias) }],
      },
    ],
  };
};

interface Memoria {
  atribuicoes: Atribuicao[];
  ativos: AtivoDoPainel[];
  linhas: LinhaDePolitica[];
  intervencoes: ChamadoDaEfetividade[];
  historico: { chamados: ChamadoDaEfetividade[]; paradas: ParadaDoAtivo[] };
  filtros: { codigos: readonly string[]; desde: Date; ativoIds?: readonly string[] }[];
  insights: InsightComEvidencia[];
  chamadosDoInsight: { id: string; ativoId: string | null }[];
  leituras: { ativoIds: readonly string[]; desde: Date; ate: Date }[];
}

function emMemoria(m: Partial<Memoria> = {}): PortasDaEfetividade & { m: Memoria } {
  const mem: Memoria = {
    atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    ativos: [ativo('a1', 'h1'), ativo('a2', 'h2')],
    linhas: [],
    intervencoes: [],
    historico: { chamados: [], paradas: [] },
    filtros: [],
    leituras: [],
    insights: [],
    chamadosDoInsight: [],
    ...m,
  };
  const nao = async (): Promise<never> => {
    throw new Error('não usada');
  };
  return {
    m: mem,
    modulos: async () => [{ modulo: 'inteligencia', inicio: antes(200), fim: null }],
    atribuicoes: async () => mem.atribuicoes,
    visibilidade: async () => ({
      aPartirDe: null,
      diasAposAtivacao: 60,
      papeis: ['admin_grupo', 'gestor_csc', 'gerente_hotel'],
    }),
    fuso: async () => 'America/Sao_Paulo',
    contagens: nao,
    insights: nao,
    insight: async (id) => mem.insights.find((i) => i.id === id) ?? null,
    ligados: nao,
    chamados: async (ids) =>
      mem.chamadosDoInsight
        .filter((c) => ids.includes(c.id))
        .map((c) => ({
          ...c,
          hotelId: 'h1',
          abertoEm: antes(10),
          estado: 'concluido',
          descricao: 'Parado',
        })),
    decidir: nao,
    metricasDoAtivo: nao,
    recalculosDoDia: nao,
    insightsDoEscopo: nao,
    nomes: async (p) => ({
      hoteis: Object.fromEntries(p.hotelIds.map((h) => [h, `Hotel ${h}`])),
      bandeiras: {},
      pessoas: {},
      ativos: Object.fromEntries(p.ativoIds.map((a) => [a, `Ativo ${a}`])),
    }),
    ativo: async (id) => mem.ativos.find((a) => a.id === id) ?? null,
    politicasDaEfetividade: async () => mem.linhas,
    intervencoes: async (filtro) => {
      mem.filtros.push(filtro);
      return mem.intervencoes.filter(
        (c) => !filtro.ativoIds || (c.ativoId !== null && filtro.ativoIds.includes(c.ativoId)),
      );
    },
    historicoDosAtivos: async (ativoIds, desde, ate) => {
      mem.leituras.push({ ativoIds, desde, ate });
      return mem.historico;
    },
  };
}

describe('efetividade no detalhe do ativo', () => {
  it('as intervenções do ativo, com o antes e depois, numa leitura do histórico', async () => {
    const p = emMemoria({ intervencoes: [troca('a1', 'h1', 120), troca('a1', 'h1', 30)] });
    const { intervencoes: lista } = await efetividadeDoAtivo(p, 'a1', agora);
    expect(lista.map((e) => e.intervencao.em)).toEqual([antes(30), antes(120)]);
    expect(lista.map((e) => e.efetividade.versao)).toEqual([4, 4]);
    expect(p.m.filtros).toEqual([
      {
        codigos: ['solucao_troca_do_equipamento'],
        desde: antes(DIAS_DAS_INTERVENCOES),
        ativoIds: ['a1'],
      },
    ]);
    // Do início da janela antes da primeira ao fim da janela depois da última, até agora.
    expect(p.m.leituras).toEqual([{ ativoIds: ['a1'], desde: antes(210), ate: agora }]);
  });

  it('sem intervenção, sem leitura do histórico; com a lista vazia na política, nem a das intervenções', async () => {
    const vazio = emMemoria();
    expect((await efetividadeDoAtivo(vazio, 'a1', agora)).intervencoes).toEqual([]);
    expect(vazio.m.leituras).toEqual([]);
    const desligada = emMemoria({
      linhas: [
        {
          id: 'p1',
          chave: 'inteligencia.efetividade',
          escopo: 'grupo',
          hotelId: null,
          bandeiraId: null,
          valor: { ...PADRAO_EFETIVIDADE, codigosDeIntervencao: [] },
          atualizadoEm: antes(1),
        },
      ],
      intervencoes: [troca('a1', 'h1', 30)],
    });
    expect((await efetividadeDoAtivo(desligada, 'a1', agora)).intervencoes).toEqual([]);
    expect(desligada.m.filtros).toEqual([]);
  });

  it('quem não decide o insight do hotel do ativo não vê', async () => {
    await expect(efetividadeDoAtivo(emMemoria(), 'a2', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    await expect(efetividadeDoAtivo(emMemoria(), 'nao-existe', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    const tecnico = emMemoria({
      atribuicoes: [atribuicao('tecnico', { tipo: 'hotel', hotelId: 'h1' })],
    });
    await expect(efetividadeDoAtivo(tecnico, 'a1', agora)).rejects.toMatchObject({
      codigo: 'inteligencia_indisponivel',
    });
  });
});

describe('a seção da efetividade abaixo da lista de insights', () => {
  it('só os hotéis em que a pessoa decide, da mais recente para a mais antiga, com os nomes', async () => {
    const p = emMemoria({
      intervencoes: [troca('a1', 'h1', 100), troca('a2', 'h2', 10), troca('a3', 'h1', 20)],
    });
    const r = await listarEfetividades(p, agora);
    expect(r.intervencoes.map((e) => [e.intervencao.ativoId, e.intervencao.hotelId])).toEqual([
      ['a3', 'h1'],
      ['a1', 'h1'],
    ]);
    expect(r.nomes.ativos).toEqual({ a1: 'Ativo a1', a3: 'Ativo a3' });
    expect(r.nomes.hoteis).toEqual({ h1: 'Hotel h1' });
    expect(p.m.filtros[0]).toEqual({
      codigos: ['solucao_troca_do_equipamento'],
      desde: antes(DIAS_DAS_INTERVENCOES),
    });
    expect(p.m.leituras[0]?.ativoIds).toEqual(['a1', 'a3']);
  });

  it(`no máximo ${LIMITE_DAS_INTERVENCOES}, e o Admin do grupo vê todos os hotéis`, async () => {
    const muitas = Array.from({ length: LIMITE_DAS_INTERVENCOES + 5 }, (_, i) =>
      troca(`a${i}`, i % 2 ? 'h1' : 'h2', 1 + i),
    );
    const r = await listarEfetividades(
      emMemoria({
        atribuicoes: [atribuicao('admin_grupo', { tipo: 'grupo' })],
        intervencoes: muitas,
      }),
      agora,
    );
    expect(r.intervencoes).toHaveLength(LIMITE_DAS_INTERVENCOES);
    expect(r.intervencoes[0]?.intervencao.em).toEqual(antes(1));
  });

  it('sem intervenção, a seção vem vazia, sem ler o histórico', async () => {
    const p = emMemoria();
    expect(await listarEfetividades(p, agora)).toEqual({
      intervencoes: [],
      nomes: { hoteis: {}, bandeiras: {}, pessoas: {}, ativos: {} },
    });
    expect(p.m.leituras).toEqual([]);
  });
});

describe('a efetividade na página do insight (opção a: depois da primeira detecção)', () => {
  const insight = (extra: Partial<InsightComEvidencia> = {}): InsightComEvidencia => ({
    id: 'i1',
    numero: 133,
    hotelId: 'h1',
    bandeiraId: null,
    hotelIds: ['h1'],
    tipo: 'atencao_ativo',
    escopo: { ativoId: 'a1', hotelId: 'h1' },
    estado: 'em_acao',
    faixa: 'alta_atencao',
    valor: 75,
    versaoScore: 3,
    anteriorId: null,
    primeiraDeteccaoEm: antes(60),
    ultimaDeteccaoEm: antes(1),
    responsavelId: 'u1',
    encerradoEm: null,
    encerradoPor: null,
    nota: null,
    motivoDeDescarte: null,
    versao: 2,
    detalhe: {},
    evidencia: { corretivaIds: [] },
    ...extra,
  });

  it('na atenção: o ativo do escopo, só as concluídas depois da primeira detecção', async () => {
    const p = emMemoria({
      insights: [insight()],
      intervencoes: [troca('a1', 'h1', 90), troca('a1', 'h1', 30)],
    });
    const { intervencoes: lista } = await efetividadeDoInsight(p, 'i1', agora);
    expect(lista.map((e) => e.intervencao.em)).toEqual([antes(30)]);
    expect(p.m.filtros[0]?.ativoIds).toEqual(['a1']);
  });

  it('no sistêmico: os ativos dos chamados da evidência; e só nos hotéis em que a pessoa decide', async () => {
    const p = emMemoria({
      insights: [
        insight({
          hotelId: null,
          hotelIds: ['h1', 'h2'],
          tipo: 'sistemico',
          escopo: { regra: 'mesmo_modelo' },
          evidencia: { corretivaIds: ['k1', 'k2', 'k3'] },
        }),
      ],
      chamadosDoInsight: [
        { id: 'k1', ativoId: 'a1' },
        { id: 'k2', ativoId: 'a2' },
        { id: 'k3', ativoId: 'a1' },
      ],
      intervencoes: [troca('a1', 'h1', 20), troca('a2', 'h2', 10)],
    });
    const { intervencoes: lista } = await efetividadeDoInsight(p, 'i1', agora);
    expect(p.m.filtros[0]?.ativoIds).toEqual(['a1', 'a2']);
    expect(lista.map((e) => e.intervencao.ativoId)).toEqual(['a1']);
  });

  it('o insight que quem lê não vê: insight_nao_encontrado', async () => {
    await expect(efetividadeDoInsight(emMemoria(), 'i1', agora)).rejects.toMatchObject({
      codigo: 'insight_nao_encontrado',
    });
  });

  it('sem ativo no insight, sem leitura', async () => {
    const p = emMemoria({
      insights: [insight({ escopo: { regra: 'mesma_area_comum' }, tipo: 'sistemico' })],
    });
    expect((await efetividadeDoInsight(p, 'i1', agora)).intervencoes).toEqual([]);
    expect(p.m.filtros).toEqual([]);
  });
});
