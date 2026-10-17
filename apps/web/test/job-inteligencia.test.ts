// A ligação do job diário do Intelligence (ADR-036), sem banco: a chave do
// insight com o vetor do pgTAP 031, e as portas do executarDiaDoTenant sobre
// uma sessão em memória, com a forma das linhas do packages/db.
import type {
  ChamadoDoJob,
  DeteccaoNoInsightDoJob,
  ExecucaoNoBancoDoJob,
  MetricaDoJob,
  NovoInsightDoJob,
  PoliticaDoJob,
  PortaDoJobDoIntelligence,
  SessaoDoJobDoIntelligence,
} from '@hubkeep/db';
import { registrosDePoliticasPorModulo } from '@hubkeep/dominio';
import {
  EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE,
  PADRAO_ATENCAO,
  executarDiaDoTenant,
} from '@hubkeep/inteligencia';
import { describe, expect, it } from 'vitest';
import {
  chaveDoInsight,
  criarJobDoDia,
  criarRecalculoDoDia,
  portasDoJob,
} from '../src/servidor/modulos/inteligencia/job';

const H1 = '11100000-0000-0000-0000-000000000001';
const H2 = '11100000-0000-0000-0000-000000000002';
// O mesmo vetor do pgTAP 031 (sha256() do banco).
const HASH = '1904d0ae84e2fb04943e72cad89dcdd2503e44f848d80db79ef3e5dab9d4728b';

const registros = registrosDePoliticasPorModulo([
  { modulo: 'inteligencia', extensao: EXTENSAO_DE_POLITICAS_DO_INTELLIGENCE },
]);

const agora = new Date('2026-09-30T12:00:00Z');
const dia = (d: number) => new Date(agora.getTime() + d * 86_400_000);

describe('chaveDoInsight', () => {
  it('família, |hoteis= e o SHA-256 da lista canônica: o vetor do pgTAP', () => {
    expect(chaveDoInsight('sistemico|regra=mesmo_modelo', [H2, H1.toUpperCase(), H1])).toBe(
      `sistemico|regra=mesmo_modelo|hoteis=${HASH}`,
    );
  });
});

/** Seis corretivas em 30 dias no ativo a1, com conclusão e reabertura. */
const chamadosPesados = (): ChamadoDoJob[] =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`,
    hotelId: H1,
    localId: 'l1',
    ativoId: 'a1',
    abertaEm: dia(-1 - i * 5),
    estado: 'em_execucao',
    impactoHospede: true,
    os: [
      {
        estado: 'concluida',
        criadaEm: dia(-1 - i * 5),
        codigoFalha: 'compressor',
        executadoPor: 'equipe_interna',
        fornecedorId: null,
        custoInformado: 120,
        transicoes: [
          { acao: 'concluir', para: 'concluida', quando: dia(-i * 5) },
          ...(i < 3
            ? [
                { acao: 'reabrir', para: 'em_execucao', quando: dia(-i * 5 + 0.5) } as const,
                { acao: 'concluir', para: 'concluida', quando: dia(-i * 5 + 0.6) } as const,
              ]
            : []),
        ],
      },
    ],
  }));

class SessaoEmMemoria implements SessaoDoJobDoIntelligence {
  lidas: string[] = [];
  metricas: MetricaDoJob[] = [];
  abertos: NovoInsightDoJob[] = [];
  atualizados: DeteccaoNoInsightDoJob[] = [];
  constructor(private readonly comModulo = true) {}
  private ler<T>(nome: string, v: T): Promise<T> {
    this.lidas.push(nome);
    return Promise.resolve(v);
  }
  modulos = () =>
    this.ler(
      'modulos',
      this.comModulo ? [{ modulo: 'inteligencia', inicio: dia(-100), fim: null }] : [],
    );
  hoteis = () =>
    this.ler('hoteis', [
      { id: H1, bandeiraId: null, status: 'ativo' as const, fuso: 'UTC' },
      { id: H2, bandeiraId: null, status: 'em_implantacao' as const, fuso: 'UTC' },
    ]);
  politicas = () =>
    this.ler<PoliticaDoJob[]>('politicas', [
      {
        id: 'p1',
        chave: 'inteligencia.atencao_ativo',
        escopo: 'grupo' as const,
        hotelId: null,
        bandeiraId: null,
        valor: { ...PADRAO_ATENCAO, limiteInsight: 60 },
        atualizadoEm: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
  ativos = () =>
    this.ler('ativos', [
      {
        id: 'a1',
        hotelId: H1,
        categoriaId: null,
        fabricante: null,
        modelo: null,
        criticidade: 5,
        garantiaAte: null,
        desativadoEm: null,
        paradas: [{ inicio: dia(-3), fim: null }],
        preventivas: [],
      },
      {
        id: 'a2',
        hotelId: H2,
        categoriaId: null,
        fabricante: null,
        modelo: null,
        criticidade: 9,
        garantiaAte: null,
        desativadoEm: null,
        paradas: [],
        preventivas: [],
      },
    ]);
  chamados = () => this.ler('chamados', chamadosPesados());
  locais = () => this.ler('locais', []);
  insights = () => this.ler('insights', []);
  calculosDoDia = () => this.ler('calculosDoDia', new Map<string, number>());
  gravarMetricas = async (linhas: readonly MetricaDoJob[]) => void this.metricas.push(...linhas);
  abrirInsight = async (n: NovoInsightDoJob) => {
    this.abertos.push(n);
    return { id: `i${this.abertos.length}` };
  };
  atualizarInsight = async (d: DeteccaoNoInsightDoJob) => void this.atualizados.push(d);
  execucoes: ExecucaoNoBancoDoJob[] = [];
  registrarExecucao = async (e: ExecucaoNoBancoDoJob) => void this.execucoes.push(e);
  reclamacoes = () => this.ler('reclamacoes', []);
  apagamentos: { ate: Date; agora: Date }[] = [];
  apagarTextos = async (ate: Date, agora: Date) => {
    this.apagamentos.push({ ate, agora });
    return 2;
  };
}

describe('portasDoJob sobre a sessão do banco', () => {
  it('só o hotel ativo entra; a política resolvida vai na versão; o insight leva a chave com hash', async () => {
    const sessao = new SessaoEmMemoria();
    const r = await executarDiaDoTenant(portasDoJob(sessao, registros, agora), { agora });

    expect(r).toMatchObject({
      semModulo: false,
      ativos: 1,
      metricasGravadas: 1,
      insightsAbertos: 1,
    });
    expect(sessao.metricas).toHaveLength(1);
    expect(sessao.metricas[0]).toMatchObject({
      dia: '2026-09-30',
      ativoId: 'a1',
      hotelId: H1,
      calculo: 1,
      recalculo: false,
      versaoPolitica: 'inteligencia.atencao_ativo=p1@2026-09-01T00:00:00.000Z',
    });
    expect(
      (sessao.metricas[0]?.detalheAtencao as { configuracao: { limiteInsight: number } })
        .configuracao.limiteInsight,
    ).toBe(60);

    const [novo] = sessao.abertos;
    const familia = `atencao_ativo|ativoId=a1|hotelId=${H1}`;
    expect(novo).toMatchObject({
      tipo: 'atencao_ativo',
      familia,
      hotelId: H1,
      bandeiraId: null,
      hotelIds: [H1],
      escopo: { ativoId: 'a1', hotelId: H1 },
      anteriorId: null,
      em: agora,
    });
    expect(novo?.chave).toMatch(
      new RegExp(`^${familia.replaceAll('|', '\\|')}\\|hoteis=[0-9a-f]{64}$`),
    );
    expect(novo?.chave).toBe(chaveDoInsight(familia, [H1]));
    expect(novo?.evidencia).toEqual({ corretivaIds: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] });
    expect(novo?.detalhe).toMatchObject({ chave: 'atencao_ativo', faixa: novo?.faixa });
    // Os módulos e as políticas são lidos uma vez.
    expect(sessao.lidas.filter((l) => l === 'modulos')).toHaveLength(1);
    expect(sessao.lidas.filter((l) => l === 'politicas')).toHaveLength(1);
  });

  it('a retenção do texto: a política do grupo vira o limite do apagamento, contado no resumo', async () => {
    const sessao = new SessaoEmMemoria();
    const politicas = sessao.politicas;
    sessao.politicas = async () => [
      ...(await politicas()),
      {
        id: 'p2',
        chave: 'inteligencia.sinal_hospede',
        escopo: 'grupo' as const,
        hotelId: null,
        bandeiraId: null,
        valor: { retencaoTextoDias: 90 },
        atualizadoEm: new Date('2026-09-01T00:00:00Z'),
      },
    ];
    const r = await executarDiaDoTenant(portasDoJob(sessao, registros, agora), { agora });
    expect(r.textosApagados).toBe(2);
    expect(sessao.apagamentos).toEqual([{ ate: dia(-90), agora }]);
    expect(sessao.execucoes[0]).toMatchObject({ textosApagados: 2 });
    expect(sessao.lidas).toContain('reclamacoes');
  });

  it('sem o módulo vigente: lê só os módulos e não grava nada', async () => {
    const sessao = new SessaoEmMemoria(false);
    const r = await executarDiaDoTenant(portasDoJob(sessao, registros, agora), { agora });
    expect(r.semModulo).toBe(true);
    expect(sessao.lidas).toEqual(['modulos']);
    expect(sessao.execucoes).toEqual([]);
    expect(sessao.metricas).toEqual([]);
    expect(sessao.abertos).toEqual([]);
  });
});

describe('criarJobDoDia', () => {
  it('roda o dia na transação do tenant, com o agora do relógio', async () => {
    const sessao = new SessaoEmMemoria();
    const tenants: string[] = [];
    const porta: PortaDoJobDoIntelligence = {
      noTenant: (tenantId, fn) => {
        tenants.push(tenantId);
        return fn(sessao);
      },
    };
    const job = criarJobDoDia({ porta, registros, relogio: { agora: () => agora } });
    const r = await job('22200000-0000-0000-0000-000000000001');
    expect(tenants).toEqual(['22200000-0000-0000-0000-000000000001']);
    expect(r).toMatchObject({ dia: '2026-09-30', metricasGravadas: 1 });
    // A execução fica registrada como disparada pelo cron, com a política de cada hotel do dia.
    expect(sessao.execucoes).toMatchObject([
      {
        disparadoPor: 'cron',
        dia: '2026-09-30',
        metricasGravadas: 1,
        versoesDePolitica: { [H1]: 'inteligencia.atencao_ativo=p1@2026-09-01T00:00:00.000Z' },
      },
    ]);
  });
});

describe('criarRecalculoDoDia', () => {
  it('grava o cálculo seguinte com a marca de recálculo, no fim do dia, sem tocar nos insights', async () => {
    const sessao = new SessaoEmMemoria();
    sessao.calculosDoDia = () => Promise.resolve(new Map([['a1', 1]]));
    const porta: PortaDoJobDoIntelligence = { noTenant: (_t, fn) => fn(sessao) };
    const recalcular = criarRecalculoDoDia({ porta, registros });
    const r = await recalcular('22200000-0000-0000-0000-000000000001', '2026-09-29', 'ops:Cesar');
    expect(r).toMatchObject({ dia: '2026-09-29', recalculo: true, metricasGravadas: 1 });
    expect(sessao.metricas).toMatchObject([{ ativoId: 'a1', calculo: 2, recalculo: true }]);
    expect(sessao.abertos).toEqual([]);
    expect(sessao.atualizados).toEqual([]);
    expect(sessao.execucoes).toMatchObject([
      { disparadoPor: 'ops:Cesar', dia: '2026-09-29', recalculo: true },
    ]);
  });

  it('uma rodada por fuso, cada uma com os hotéis dele e o fim do dia local', async () => {
    const sessao = new SessaoEmMemoria();
    sessao.hoteis = () =>
      Promise.resolve([
        { id: H1, bandeiraId: null, status: 'ativo' as const, fuso: 'America/Sao_Paulo' },
        { id: H2, bandeiraId: null, status: 'ativo' as const, fuso: 'America/Manaus' },
      ]);
    const ates: string[] = [];
    const ativos = sessao.ativos;
    // O motor pede os ativos até o `agora` da rodada: é por ele que se vê o fim do dia local.
    sessao.ativos = ((ate: Date) => {
      ates.push(ate.toISOString());
      return ativos();
    }) as unknown as typeof sessao.ativos;
    const porta: PortaDoJobDoIntelligence = { noTenant: (_t, fn) => fn(sessao) };
    const r = await criarRecalculoDoDia({ porta, registros })('t', '2026-09-29', 'ops:Cesar');
    // Manaus vem antes de São Paulo na ordem dos fusos.
    expect(ates).toEqual(['2026-09-30T03:59:59.999Z', '2026-09-30T02:59:59.999Z']);
    expect(sessao.metricas.map((m) => [m.ativoId, m.hotelId, m.dia])).toEqual([
      ['a2', H2, '2026-09-29'],
      ['a1', H1, '2026-09-29'],
    ]);
    expect(r).toMatchObject({ dia: '2026-09-29', recalculo: true, metricasGravadas: 2 });
    expect(sessao.execucoes).toHaveLength(2);
  });

  it('o dia antes do início do módulo: nada é lido além dos módulos, nada é gravado', async () => {
    const sessao = new SessaoEmMemoria();
    const porta: PortaDoJobDoIntelligence = { noTenant: (_t, fn) => fn(sessao) };
    const r = await criarRecalculoDoDia({ porta, registros })('t', '2026-01-01', 'ops:Cesar');
    expect(r.semModulo).toBe(true);
    expect(sessao.lidas).toEqual(['modulos']);
    expect(sessao.metricas).toEqual([]);
  });
});
