// As reclamações nas páginas do insight e do ativo (C2 do ADR-047): as da
// evidência do insight sistêmico, como quem pede as lê, e as ligadas ao ativo
// na janela da política do score, só para quem decide o insight do hotel dele.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoPainel,
  type InsightComEvidencia,
  LIMITE_DAS_RECLAMACOES,
  type LinhaDePolitica,
  PADRAO_IMPACTO_HOSPEDE,
  type PortasDasReclamacoes,
  type SinalDaFila,
  reclamacoesDoAtivo,
  reclamacoesDoInsight,
  sinaisDaEvidencia,
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

const ativo: AtivoDoPainel = {
  id: 'a1',
  nome: 'Elevador social 2',
  hotelId: 'h1',
  bandeiraId: null,
  criticidade: 5,
  desativadoEm: null,
  fuso: 'America/Sao_Paulo',
  dataCompra: null,
  garantiaAte: null,
};

const insight = (evidencia: unknown): InsightComEvidencia => ({
  id: 'i1',
  numero: 133,
  hotelId: 'h1',
  bandeiraId: null,
  hotelIds: ['h1'],
  tipo: 'sistemico',
  escopo: { regra: 'reclamacoes_categoria' },
  estado: 'novo',
  faixa: 'atencao',
  valor: null,
  versaoScore: 5,
  anteriorId: null,
  primeiraDeteccaoEm: antes(2),
  ultimaDeteccaoEm: antes(1),
  responsavelId: null,
  encerradoEm: null,
  encerradoPor: null,
  nota: null,
  motivoDeDescarte: null,
  versao: 1,
  detalhe: null,
  evidencia,
});

const sinal = (id: string, p: Partial<SinalDaFila> = {}): SinalDaFila => ({
  id,
  hotelId: 'h1',
  fonte: 'google',
  idExterno: id,
  ocorridoEm: antes(3),
  nota: 2,
  escala: 5,
  texto: 'O elevador parou',
  textoApagadoEm: null,
  idioma: 'pt-BR',
  uhCitada: null,
  manutencao: true,
  categoriaId: 'k1',
  uhId: 'uh1',
  ativoId: 'a1',
  ligacao: 'confirmada',
  classificadoEm: antes(2),
  classificadoPor: 'u2',
  importadoEm: antes(2),
  versao: 2,
  chamadoId: null,
  ...p,
});

interface Memoria {
  atribuicoes: Atribuicao[];
  insight: InsightComEvidencia | null;
  /** As reclamações que quem pede lê (a RLS já filtrou). */
  sinais: SinalDaFila[];
  linhasDoImpacto: LinhaDePolitica[];
  porIds: { ids: readonly string[]; limite: number }[];
  doAtivo: { ativoId: string; desde: Date; ate: Date; limite: number }[];
}

function emMemoria(m: Partial<Memoria> = {}): PortasDasReclamacoes & { m: Memoria } {
  const mem: Memoria = {
    atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    insight: null,
    sinais: [],
    linhasDoImpacto: [],
    porIds: [],
    doAtivo: [],
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
    insight: async (id) => (mem.insight?.id === id ? mem.insight : null),
    ligados: nao,
    chamados: nao,
    decidir: nao,
    insightsDoEscopo: nao,
    nomes: async (p) => ({
      hoteis: {},
      bandeiras: {},
      pessoas: Object.fromEntries(p.usuarioIds.map((id) => [id, `Pessoa ${id}`])),
      ativos: Object.fromEntries(p.ativoIds.map((id) => [id, `Ativo ${id}`])),
    }),
    politicasDaEfetividade: nao,
    intervencoes: nao,
    ativo: async (id) => (id === ativo.id ? ativo : null),
    metricasDoAtivo: nao,
    historicoDosAtivos: nao,
    politicasDaSubstituicao: nao,
    politicasDoImpacto: async () => mem.linhasDoImpacto,
    sinaisDoHotelNaJanela: nao,
    sinaisPorIds: async (ids, limite) => {
      mem.porIds.push({ ids, limite });
      return mem.sinais.filter((s) => ids.includes(s.id)).slice(0, limite);
    },
    sinaisDoAtivo: async (ativoId, desde, ate, limite) => {
      mem.doAtivo.push({ ativoId, desde, ate, limite });
      return mem.sinais.filter((s) => s.ativoId === ativoId).slice(0, limite);
    },
    nomesDasUhs: async (ids) => Object.fromEntries(ids.map((id) => [id, `UH ${id}`])),
  };
}

describe('os ids da evidência', () => {
  it('só os textos de sinalIds; sem o campo, null', () => {
    expect(sinaisDaEvidencia({ sinalIds: ['s1', 2, 's2'], corretivaIds: [] })).toEqual([
      's1',
      's2',
    ]);
    expect(sinaisDaEvidencia({ corretivaIds: ['c1'] })).toBeNull();
    expect(sinaisDaEvidencia(null)).toBeNull();
  });
});

describe('as reclamações da evidência do insight', () => {
  it('as que quem pede lê, com o total da evidência e os nomes', async () => {
    const p = emMemoria({
      insight: insight({ sinalIds: ['s1', 's2', 's3'], corretivaIds: [] }),
      sinais: [sinal('s1'), sinal('s2', { uhId: null, classificadoPor: null })],
    });
    const r = await reclamacoesDoInsight(p, 'i1', agora);
    expect(r).toMatchObject({ total: 3, limitada: false, janelaDias: null });
    expect(r?.sinais.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(r?.nomes).toEqual({
      ativos: { a1: 'Ativo a1' },
      pessoas: { u2: 'Pessoa u2' },
      uhs: { uh1: 'UH uh1' },
    });
    expect(p.m.porIds).toEqual([{ ids: ['s1', 's2', 's3'], limite: LIMITE_DAS_RECLAMACOES + 1 }]);
  });

  it('quem não lê as reclamações do hotel recebe só o total', async () => {
    const p = emMemoria({ insight: insight({ sinalIds: ['s1', 's2', 's3'] }) });
    const r = await reclamacoesDoInsight(p, 'i1', agora);
    expect(r).toMatchObject({ sinais: [], total: 3 });
  });

  it('acima de 50, as 50 mais recentes e a marca de limitada', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `s${String(i).padStart(2, '0')}`);
    const p = emMemoria({
      insight: insight({ sinalIds: ids }),
      sinais: ids.map((id) => sinal(id)),
    });
    const r = await reclamacoesDoInsight(p, 'i1', agora);
    expect(r?.sinais).toHaveLength(LIMITE_DAS_RECLAMACOES);
    expect(r).toMatchObject({ total: 60, limitada: true });
  });

  it('o insight sem sinalIds devolve null, sem ler reclamação', async () => {
    const p = emMemoria({ insight: insight({ corretivaIds: ['c1'] }) });
    expect(await reclamacoesDoInsight(p, 'i1', agora)).toBeNull();
    expect(p.m.porIds).toEqual([]);
  });

  it('o insight que quem pede não lê: insight_nao_encontrado', async () => {
    await expect(reclamacoesDoInsight(emMemoria(), 'i1', agora)).rejects.toMatchObject({
      codigo: 'insight_nao_encontrado',
    });
  });
});

describe('as reclamações ligadas ao ativo', () => {
  it('na janela da política do score, as confirmadas e as possíveis', async () => {
    const p = emMemoria({
      sinais: [sinal('s1'), sinal('s2', { ligacao: 'possivel' }), sinal('s3', { ativoId: 'a2' })],
    });
    const r = await reclamacoesDoAtivo(p, 'a1', agora);
    expect(r).toMatchObject({
      total: null,
      limitada: false,
      janelaDias: PADRAO_IMPACTO_HOSPEDE.janelaDias,
    });
    expect(r.sinais.map((s) => [s.id, s.ligacao])).toEqual([
      ['s1', 'confirmada'],
      ['s2', 'possivel'],
    ]);
    expect(p.m.doAtivo).toEqual([
      { ativoId: 'a1', desde: antes(90), ate: agora, limite: LIMITE_DAS_RECLAMACOES + 1 },
    ]);
  });

  it('a janela vem da política do hotel', async () => {
    const p = emMemoria({
      linhasDoImpacto: [
        {
          id: 'p1',
          chave: 'inteligencia.impacto_hospede',
          escopo: 'hotel',
          hotelId: 'h1',
          bandeiraId: null,
          valor: { ...PADRAO_IMPACTO_HOSPEDE, janelaDias: 30 },
          atualizadoEm: antes(10),
        },
      ],
    });
    const r = await reclamacoesDoAtivo(p, 'a1', agora);
    expect(r.janelaDias).toBe(30);
    expect(p.m.doAtivo[0]?.desde).toEqual(antes(30));
  });

  it('quem não decide o insight do hotel do ativo: ativo_nao_encontrado', async () => {
    const p = emMemoria({
      atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })],
    });
    await expect(reclamacoesDoAtivo(p, 'a1', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    expect(p.m.doAtivo).toEqual([]);
  });
});
