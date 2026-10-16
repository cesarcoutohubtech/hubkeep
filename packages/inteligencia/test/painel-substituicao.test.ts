// O sinal de substituição no detalhe do ativo (proposta de 16/10/2026, Cesar e
// Kaio): calculado na leitura, para quem decide o insight do hotel do ativo,
// com os critérios de 12 meses e o custo sobre a reposição sem dado no 1.0.
import type { Atribuicao, Escopo, Papel } from '@hubkeep/dominio';
import { describe, expect, it } from 'vitest';
import {
  type AtivoDoPainel,
  type ChamadoDaEfetividade,
  DIAS_DA_SUBSTITUICAO,
  type LinhaDePolitica,
  type MetricaDoPainel,
  PADRAO_SUBSTITUICAO,
  type ParadaDoAtivo,
  type PortasDaSubstituicao,
  anosCompletos,
  substituicaoDoAtivo,
} from '../src/index';

const DIA = 86_400_000;
const HORA = 3_600_000;
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

const ativo = (p: Partial<AtivoDoPainel> = {}): AtivoDoPainel => ({
  id: 'a1',
  nome: 'Lava-roupa industrial',
  hotelId: 'h1',
  bandeiraId: null,
  criticidade: 4,
  desativadoEm: null,
  fuso: 'America/Sao_Paulo',
  dataCompra: '2014-06-01',
  garantiaAte: '2016-06-01',
  ...p,
});

let seq = 0;
const corretiva = (dias: number, p: Partial<ChamadoDaEfetividade> = {}): ChamadoDaEfetividade => {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`,
    hotelId: 'h1',
    bandeiraId: null,
    localId: 'l1',
    ativoId: 'a1',
    abertaEm: antes(dias),
    estado: 'concluido',
    impactoHospede: false,
    os: [
      {
        estado: 'concluida',
        criadaEm: antes(dias),
        codigoFalha: null,
        executadoPor: 'equipe_interna',
        fornecedorId: null,
        custoInformado: null,
        codigoSolucaoId: null,
        codigoSolucaoChave: null,
        transicoes: [{ acao: 'concluir', para: 'concluida', quando: antes(dias - 1) }],
      },
    ],
    ...p,
  };
};

const parada = (dias: number, horas: number): ParadaDoAtivo => ({
  ativoId: 'a1',
  chamadoId: 'c',
  inicio: antes(dias),
  fim: new Date(antes(dias).getTime() + horas * HORA),
});

const metrica = (reincidencia: number | null): MetricaDoPainel => ({
  dia: '2026-10-09',
  calculo: 1,
  recalculo: false,
  calculadoEm: antes(1),
  atencao: 40,
  faixa: 'atencao',
  reincidencia,
  versaoFormulaAtencao: 6,
  versaoFormulaReincidencia: 4,
  versaoPolitica: 'padrao',
  detalheAtencao: null,
  detalheReincidencia: null,
});

interface Memoria {
  atribuicoes: Atribuicao[];
  ativos: AtivoDoPainel[];
  linhas: LinhaDePolitica[];
  historico: { chamados: ChamadoDaEfetividade[]; paradas: ParadaDoAtivo[] };
  metricas: MetricaDoPainel[];
  leituras: { ativoIds: readonly string[]; desde: Date; ate: Date }[];
  series: { ativoId: string; desde: string }[];
}

function emMemoria(m: Partial<Memoria> = {}): PortasDaSubstituicao & { m: Memoria } {
  const mem: Memoria = {
    atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h1' })],
    ativos: [ativo()],
    linhas: [],
    historico: { chamados: [], paradas: [] },
    metricas: [],
    leituras: [],
    series: [],
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
    insight: nao,
    ligados: nao,
    chamados: nao,
    decidir: nao,
    insightsDoEscopo: nao,
    nomes: nao,
    politicasDaEfetividade: nao,
    intervencoes: nao,
    ativo: async (id) => mem.ativos.find((a) => a.id === id) ?? null,
    metricasDoAtivo: async (ativoId, desde) => {
      mem.series.push({ ativoId, desde });
      return mem.metricas;
    },
    historicoDosAtivos: async (ativoIds, desde, ate) => {
      mem.leituras.push({ ativoIds, desde, ate });
      return mem.historico;
    },
    politicasDaSubstituicao: async () => mem.linhas,
  };
}

/** Sete corretivas em 12 meses, uma por mês, cada uma com 7 h de parada: o cenário da demonstração. */
const lavaRoupa = () => ({
  chamados: [0, 1, 2, 3, 4, 5, 6].map((i) => corretiva(170 - i * 26)),
  paradas: [0, 1, 2, 3, 4, 5, 6].map((i) => parada(170 - i * 26, 7)),
});

const criterio = (r: Awaited<ReturnType<typeof substituicaoDoAtivo>>, chave: string) =>
  r?.substituicao.criterios.find((c) => c.chave === chave);

describe('sinal de substituição no detalhe do ativo', () => {
  it('a lava-roupa de 12 anos que falha todo mês: avaliar substituição, com cada critério', async () => {
    const p = emMemoria({ historico: lavaRoupa(), metricas: [metrica(64)] });
    const r = await substituicaoDoAtivo(p, 'a1', agora);
    expect(r?.substituicao.sinal).toBe('avaliar_substituicao');
    expect(r?.substituicao.versao).toBe(1);
    expect(r?.calculadoEm).toEqual(agora);
    expect(r?.substituicao.criterios.map((c) => [c.chave, c.valor, c.limite, c.atingido])).toEqual([
      ['corretivas12m', 7, 6, true],
      ['horasParadas12m', 49, 40, true],
      ['idadeAnos', 12, 10, true],
      // O valor de reposição é da 2.0.
      ['custoSobreReposicao', null, 0.5, null],
      ['impactoHospede', 0, 70, false],
      ['criticidade', 0.8, 0.75, true],
      ['reincidencia', 64, 70, false],
    ]);
    expect([r?.substituicao.atingidos, r?.avaliados]).toEqual([4, 6]);
    expect(r?.substituicao.garantiaVigente).toBe(false);
    // Uma leitura do histórico de 12 meses e a série da página, para a reincidência do último dia.
    expect(p.m.leituras).toEqual([
      { ativoIds: ['a1'], desde: antes(DIAS_DA_SUBSTITUICAO), ate: agora },
    ]);
    expect(p.m.series).toEqual([{ ativoId: 'a1', desde: '2026-07-13' }]);
  });

  it('fora da conta: o chamado cancelado, o aberto há mais de 12 meses e a parada antes da janela', async () => {
    const { chamados, paradas } = lavaRoupa();
    const p = emMemoria({
      historico: {
        chamados: [
          ...chamados.slice(1),
          corretiva(30, { estado: 'cancelado' }),
          corretiva(DIAS_DA_SUBSTITUICAO + 2),
        ],
        paradas: [...paradas.slice(1), parada(DIAS_DA_SUBSTITUICAO + 5, 3)],
      },
    });
    const r = await substituicaoDoAtivo(p, 'a1', agora);
    expect(criterio(r, 'corretivas12m')?.valor).toBe(6);
    expect(criterio(r, 'horasParadas12m')?.valor).toBe(42);
  });

  it('o impacto no hóspede é a porcentagem dos chamados de 12 meses que afetaram hóspede', async () => {
    const p = emMemoria({
      historico: {
        chamados: [
          corretiva(10, { impactoHospede: true }),
          corretiva(20, { impactoHospede: true }),
          corretiva(30, { impactoHospede: true }),
          corretiva(40, { impactoHospede: null }),
        ],
        paradas: [],
      },
    });
    const r = await substituicaoDoAtivo(p, 'a1', agora);
    expect(criterio(r, 'impactoHospede')).toMatchObject({ valor: 75, atingido: true });
  });

  it('na garantia, com dois critérios atingidos: revisão necessária; a garantia vale até o fim do dia no fuso do hotel', async () => {
    // 02:00 UTC de 10/10 ainda é 09/10 em São Paulo.
    const madrugada = new Date('2026-10-10T02:00:00Z');
    const p = emMemoria({
      ativos: [ativo({ dataCompra: '2025-01-01', garantiaAte: '2026-10-09' })],
      historico: lavaRoupa(),
    });
    const r = await substituicaoDoAtivo(p, 'a1', madrugada);
    expect(r?.substituicao.garantiaVigente).toBe(true);
    expect(r?.substituicao.sinal).toBe('revisao_necessaria');
    // Às 12:00 UTC, já é 10/10 no hotel: a garantia venceu.
    const depois = await substituicaoDoAtivo(p, 'a1', agora);
    expect(depois?.substituicao.garantiaVigente).toBe(false);
    expect(depois?.substituicao.sinal).toBe('observar');
  });

  it('sem a data de compra, sem a garantia e sem dia gravado: os critérios ficam sem dado', async () => {
    const p = emMemoria({
      ativos: [ativo({ dataCompra: null, garantiaAte: null, criticidade: null })],
    });
    const r = await substituicaoDoAtivo(p, 'a1', agora);
    expect(
      r?.substituicao.criterios.filter((c) => c.atingido === null).map((c) => c.chave),
    ).toEqual(['idadeAnos', 'custoSobreReposicao', 'criticidade', 'reincidencia']);
    expect(r?.avaliados).toBe(3);
    expect(r?.substituicao.garantiaVigente).toBeNull();
    expect(r?.substituicao.sinal).toBe('sem_sinal');
  });

  it('a política do hotel vale sobre a do grupo; a linha fora do formato não vale', async () => {
    const limites = { ...PADRAO_SUBSTITUICAO.limites, corretivas12m: 10 };
    const linha = (p: Partial<LinhaDePolitica>): LinhaDePolitica => ({
      id: 'p1',
      chave: 'inteligencia.substituicao',
      escopo: 'grupo',
      hotelId: null,
      bandeiraId: null,
      valor: PADRAO_SUBSTITUICAO,
      atualizadoEm: antes(30),
      ...p,
    });
    const p = emMemoria({
      historico: lavaRoupa(),
      linhas: [
        linha({ id: 'p1' }),
        linha({
          id: 'p2',
          escopo: 'hotel',
          hotelId: 'h1',
          valor: { ...PADRAO_SUBSTITUICAO, limites },
        }),
      ],
    });
    expect(criterio(await substituicaoDoAtivo(p, 'a1', agora), 'corretivas12m')).toMatchObject({
      limite: 10,
      atingido: false,
    });
    p.m.linhas = [linha({ id: 'p3', escopo: 'hotel', hotelId: 'h1', valor: { limites: 1 } })];
    expect(criterio(await substituicaoDoAtivo(p, 'a1', agora), 'corretivas12m')?.limite).toBe(6);
  });

  it('o ativo baixado não tem sinal, e quem não decide o insight do hotel não vê o ativo', async () => {
    const baixado = emMemoria({ ativos: [ativo({ desativadoEm: antes(1) })] });
    expect(await substituicaoDoAtivo(baixado, 'a1', agora)).toBeNull();
    expect(baixado.m.leituras).toEqual([]);

    const outro = emMemoria({
      atribuicoes: [atribuicao('gerente_hotel', { tipo: 'hotel', hotelId: 'h2' })],
    });
    await expect(substituicaoDoAtivo(outro, 'a1', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
    await expect(substituicaoDoAtivo(emMemoria(), 'a9', agora)).rejects.toMatchObject({
      codigo: 'ativo_nao_encontrado',
    });
  });

  it('anosCompletos: conta o aniversário no próprio dia, e a data futura não tem idade', () => {
    expect(anosCompletos('2014-10-10', '2026-10-10')).toBe(12);
    expect(anosCompletos('2014-10-11', '2026-10-10')).toBe(11);
    expect(anosCompletos('2014-11-01', '2026-10-10')).toBe(11);
    expect(anosCompletos('2026-10-11', '2026-10-10')).toBeNull();
    expect(anosCompletos(null, '2026-10-10')).toBeNull();
  });
});
