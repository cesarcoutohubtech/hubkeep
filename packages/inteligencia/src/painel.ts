// O painel do Intelligence (as telas do 1.0): a leitura e a decisão do insight
// por uma pessoa, em código puro, por portas, como o job (job.ts). As portas
// são implementadas na pasta do módulo no servidor do web, com o hk_app e o
// contexto de quem pede: o que elas devolvem já vem recortado pela RLS da
// app.insight (só quem decide lê). Nos testes, entram em memória.
//
// - Sem o módulo `inteligencia` vigente, ou sem papel que decide insight
//   (PAPEIS_DO_INSIGHT), o painel não existe: 404 inteligencia_indisponivel,
//   e o menu some (proposta das telas, decisão 3).
// - Decidir só na página do insight (decisão 2): a transição é a de
//   decidirNoInsight, com a trava de versão.
// - Responsável (aprovado por Cesar em 10/10/2026, issue #166): quem toma a
//   primeira ação vira o responsável. A reatribuição pelo Admin do grupo e
//   pelo Gestor CSC fica para depois.
// - Sem linha do tempo no 1.0 (Cesar, 10/10/2026): a página mostra as datas
//   do próprio registro.
// - Detalhe do ativo: o resultado original gravado de cada dia (decisão de
//   07/10/2026, aprovada por Cesar na #166), nos últimos 90 dias. A página
//   só existe para quem decide o insight do hotel do ativo: a métrica nunca
//   tem mais leitores que o insight (Cesar, 10/10/2026).
import {
  type Atribuicao,
  type ModuloContratado,
  NaoEncontrado,
  conflitoDeVersao,
  modulosVigentes,
  vigente,
} from '@hubkeep/dominio';
import type { TipoDeInsight } from './dia';
import {
  ACOES_DO_INSIGHT,
  type AcaoDoInsight,
  type AlcanceDoInsight,
  ESTADOS_ABERTOS_DO_INSIGHT,
  ESTADOS_DO_INSIGHT,
  type EstadoDoInsight,
  type MotivoDeDescarte,
  PAPEIS_DO_INSIGHT,
  TRANSICOES_DO_INSIGHT,
  decidirNoInsight,
  podeDecidirInsight,
  substituidoPor,
} from './insight';
import { DIA_MS } from './score';

/** Os tipos de insight (`TipoDeInsight`), para conferir o que vem do banco e da API. */
export const TIPOS_DE_INSIGHT = [
  'atencao_ativo',
  'sistemico',
] as const satisfies readonly TipoDeInsight[];
export const ehTipoDeInsight = (t: unknown): t is TipoDeInsight =>
  typeof t === 'string' && (TIPOS_DE_INSIGHT as readonly string[]).includes(t);

/** O filtro de estado da lista: os abertos (padrão), os encerrados ou um estado. */
export const FILTROS_DE_ESTADO_DO_INSIGHT = [
  'abertos',
  'encerrados',
  ...ESTADOS_DO_INSIGHT,
] as const;
export type FiltroDeEstadoDoInsight = (typeof FILTROS_DE_ESTADO_DO_INSIGHT)[number];

/** As faixas que contam no indicador "em alta atenção ou crítico". */
export const FAIXAS_DE_ALTA_ATENCAO: readonly string[] = ['alta_atencao', 'critico'];

/** Semanas da série de chamados da página do insight. */
export const SEMANAS_DA_SERIE = 12;

export interface InsightDoPainel {
  id: string;
  /** Null no insight de rede. */
  hotelId: string | null;
  bandeiraId: string | null;
  hotelIds: readonly string[];
  tipo: TipoDeInsight;
  escopo: Readonly<Record<string, string>>;
  estado: EstadoDoInsight;
  faixa: string;
  /** Null no sistêmico, que não tem score. */
  valor: number | null;
  versaoScore: number;
  anteriorId: string | null;
  primeiraDeteccaoEm: Date;
  ultimaDeteccaoEm: Date;
  responsavelId: string | null;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  nota: string | null;
  motivoDeDescarte: MotivoDeDescarte | null;
  versao: number;
}

/** O insight com o que a regra encontrou: o score (`Score`) ou o sinal (`SinalSistemico`). */
export interface InsightComEvidencia extends InsightDoPainel {
  detalhe: unknown;
  evidencia: unknown;
}

/** Um insight ligado a outro por `anterior_id`, para a substituição. */
export interface InsightLigado {
  id: string;
  anteriorId: string | null;
  abertoEm: Date;
  encerradoEm: Date | null;
}

export interface ChamadoDoInsight {
  id: string;
  hotelId: string;
  ativoId: string | null;
  abertoEm: Date;
  estado: string;
  descricao: string;
}

export interface FiltroDeInsights {
  estados: readonly EstadoDoInsight[];
  tipo?: TipoDeInsight;
  faixa?: string;
  /** Os insights que incluem este hotel. */
  hotelId?: string;
}

/** Os abertos contados por tipo, faixa e se têm responsável. */
export interface ContagemDeInsights {
  tipo: TipoDeInsight;
  faixa: string;
  comResponsavel: boolean;
  quantidade: number;
}

export interface NomesDoPainel {
  hoteis: Readonly<Record<string, string>>;
  bandeiras: Readonly<Record<string, string>>;
  pessoas: Readonly<Record<string, string>>;
}

export interface DecisaoGravada {
  insightId: string;
  acao: AcaoDoInsight;
  versaoEsperada: number;
  estado: EstadoDoInsight;
  nota: string | null;
  motivoDeDescarte: MotivoDeDescarte | null;
  responsavelId: string;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  em: Date;
}

/** O que o painel lê e grava, no contexto de quem pede. */
export interface PortasDoPainel {
  modulos(): Promise<readonly ModuloContratado[]>;
  atribuicoes(): Promise<readonly Atribuicao[]>;
  contagens(estados: readonly EstadoDoInsight[]): Promise<readonly ContagemDeInsights[]>;
  /** No máximo LIMITE_DA_LISTA, da última detecção mais recente para a mais antiga. */
  insights(filtro: FiltroDeInsights): Promise<readonly InsightDoPainel[]>;
  insight(id: string): Promise<InsightComEvidencia | null>;
  /** Os insights citados como anteriores destes e os que os citam como anterior. */
  ligados(ids: readonly string[]): Promise<readonly InsightLigado[]>;
  /** Os chamados destes ids que quem pede vê (a RLS do chamado filtra). */
  chamados(ids: readonly string[]): Promise<readonly ChamadoDoInsight[]>;
  nomes(p: {
    hotelIds: readonly string[];
    bandeiraIds: readonly string[];
    usuarioIds: readonly string[];
  }): Promise<NomesDoPainel>;
  /** Grava com a trava de versão (conflito_de_versao), a auditoria e o evento. */
  decidir(d: DecisaoGravada): Promise<{ versao: number }>;
  /** O ativo, se quem pede o lê, com a bandeira do hotel dele. */
  ativo(id: string): Promise<AtivoDoPainel | null>;
  /**
   * O resultado original de cada dia (o primeiro cálculo, sem recálculo) a
   * partir de `desde` (AAAA-MM-DD), em ordem de dia.
   */
  metricasDoAtivo(ativoId: string, desde: string): Promise<readonly MetricaDoPainel[]>;
  /** Os insights de um tipo com este par no escopo, do mais novo ao mais antigo. */
  insightsDoEscopo(
    tipo: TipoDeInsight,
    chave: string,
    valor: string,
  ): Promise<readonly InsightDoPainel[]>;
}

/** Dias da série de atenção da página do ativo. */
export const DIAS_DA_SERIE_DO_ATIVO = 90;

export interface AtivoDoPainel {
  id: string;
  nome: string;
  hotelId: string;
  bandeiraId: string | null;
  criticidade: number | null;
  desativadoEm: Date | null;
}

/** Uma linha da `app.metrica_ativo_diaria`, como o job gravou. */
export interface MetricaDoPainel {
  /** AAAA-MM-DD. */
  dia: string;
  calculo: number;
  recalculo: boolean;
  calculadoEm: Date;
  atencao: number | null;
  faixa: string;
  reincidencia: number | null;
  versaoFormulaAtencao: number;
  versaoFormulaReincidencia: number;
  versaoPolitica: string;
  /** O `Score` da atenção, com os componentes e a configuração (limite do insight). */
  detalheAtencao: unknown;
  detalheReincidencia: unknown;
}

export interface PaginaDoAtivo {
  ativo: AtivoDoPainel;
  /** A atenção de cada dia gravado nos últimos 90 dias, em ordem de dia. */
  serie: { dia: string; atencao: number | null; faixa: string }[];
  /** O último dia gravado, com o detalhe; null se o job ainda não gravou nenhum. */
  atual: MetricaDoPainel | null;
  /** Os insights de atenção deste ativo, abertos e encerrados. */
  insights: ItemDaLista[];
  nomes: NomesDoPainel;
}

export const LIMITE_DA_LISTA = 500;

export interface ResumoDoPainel {
  abertos: number;
  altaAtencaoOuCritico: number;
  sistemicos: number;
  semResponsavel: number;
}

export interface ItemDaLista extends InsightDoPainel {
  /** O insight que este substitui (aberto enquanto o anterior estava aberto). */
  substitui: string | null;
  substituidoPor: string | null;
  podeDecidir: boolean;
}

export interface ListaDeInsights {
  insights: ItemDaLista[];
  nomes: NomesDoPainel;
}

export interface PaginaDoInsight {
  insight: InsightComEvidencia & {
    substitui: string | null;
    substituidoPor: string | null;
    podeDecidir: boolean;
    /** As ações que o estado permite, vazias para quem não decide. */
    acoes: AcaoDoInsight[];
  };
  /** Os chamados da evidência que quem lê vê, do mais recente ao mais antigo. */
  chamados: ChamadoDoInsight[];
  /** Chamados por semana, da mais antiga para a atual. */
  serie: { inicio: Date; quantidade: number }[];
  nomes: NomesDoPainel;
}

export interface PedidoDeDecisao {
  insightId: string;
  acao: AcaoDoInsight;
  versao: number;
  nota?: string | null | undefined;
  motivoDeDescarte?: string | null | undefined;
  /** Quem decide (o usuário do contexto). */
  usuarioId: string;
}

const indisponivel = () =>
  new NaoEncontrado(
    'inteligencia_indisponivel',
    'O Intelligence não está disponível para você neste tenant.',
  );

const naoEncontrado = () => new NaoEncontrado('insight_nao_encontrado', 'Insight não encontrado.');

/** O módulo vigente e algum papel que decide insight; senão, o painel não existe. */
async function exigirPainel(p: PortasDoPainel, agora: Date): Promise<readonly Atribuicao[]> {
  const [modulos, atribuicoes] = await Promise.all([p.modulos(), p.atribuicoes()]);
  const temPapel = atribuicoes.some(
    (a) => vigente(a, agora) && PAPEIS_DO_INSIGHT.includes(a.papel),
  );
  if (!modulosVigentes(modulos, agora).has('inteligencia') || !temPapel) throw indisponivel();
  return atribuicoes;
}

export function alcanceDoInsight(
  i: Pick<InsightDoPainel, 'hotelId' | 'bandeiraId'>,
): AlcanceDoInsight {
  return i.hotelId
    ? { tipo: 'hotel', hotelId: i.hotelId, bandeiraId: i.bandeiraId }
    : { tipo: 'rede', bandeiraId: i.bandeiraId };
}

export function acoesDoEstado(estado: EstadoDoInsight): AcaoDoInsight[] {
  return ACOES_DO_INSIGHT.filter((a) => TRANSICOES_DO_INSIGHT[a].de.includes(estado));
}

/** Quem toma a primeira ação vira o responsável; depois, ele continua. */
export function responsavelDepoisDaAcao(atual: string | null, usuarioId: string): string {
  return atual ?? usuarioId;
}

/** O insight que este substitui: o anterior dele, se este abriu com o anterior ainda aberto. */
export function substitui(
  insight: Pick<InsightDoPainel, 'anteriorId' | 'primeiraDeteccaoEm'>,
  ligados: readonly InsightLigado[],
): string | null {
  const anterior = ligados.find((l) => l.id === insight.anteriorId);
  if (!anterior) return null;
  return anterior.encerradoEm === null ||
    insight.primeiraDeteccaoEm.getTime() < anterior.encerradoEm.getTime()
    ? anterior.id
    : null;
}

/** Os ids de chamado da evidência (`corretivaIds`), se houver. */
export function chamadosDaEvidencia(evidencia: unknown): string[] {
  const ids =
    evidencia && typeof evidencia === 'object'
      ? (evidencia as { corretivaIds?: unknown }).corretivaIds
      : undefined;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Quantos chamados abriram em cada semana, das `semanas` que terminam em
 * `agora`. Cada semana vai do instante depois do `inicio` até o fim dela,
 * inclusive: o chamado aberto em `agora` cai na última.
 */
export function serieSemanal(
  datas: readonly Date[],
  agora: Date,
  semanas = SEMANAS_DA_SERIE,
): { inicio: Date; quantidade: number }[] {
  const semana = 7 * DIA_MS;
  const inicio = agora.getTime() - semanas * semana;
  const serie = Array.from({ length: semanas }, (_, i) => ({
    inicio: new Date(inicio + i * semana),
    quantidade: 0,
  }));
  for (const d of datas) {
    const ponto = serie[Math.ceil((d.getTime() - inicio) / semana) - 1];
    if (ponto && d.getTime() <= agora.getTime()) ponto.quantidade += 1;
  }
  return serie;
}

function estadosDoFiltro(filtro: FiltroDeEstadoDoInsight): readonly EstadoDoInsight[] {
  if (filtro === 'abertos') return ESTADOS_ABERTOS_DO_INSIGHT;
  if (filtro === 'encerrados') return ['resolvido', 'descartado'];
  return [filtro];
}

const unicos = (xs: readonly (string | null)[]) =>
  [...new Set(xs.filter((x): x is string => x !== null))].sort();

function nomesDe(p: PortasDoPainel, insights: readonly InsightDoPainel[]) {
  return p.nomes({
    hotelIds: unicos(insights.flatMap((i) => i.hotelIds)),
    bandeiraIds: unicos(insights.map((i) => i.bandeiraId)),
    usuarioIds: unicos(insights.flatMap((i) => [i.responsavelId, i.encerradoPor])),
  });
}

function vinculos(
  i: InsightDoPainel,
  ligados: readonly InsightLigado[],
): { substitui: string | null; substituidoPor: string | null } {
  return {
    substitui: substitui(i, ligados),
    substituidoPor: substituidoPor(
      { id: i.id, encerradoEm: i.encerradoEm },
      ligados.map((l) => ({ id: l.id, anteriorId: l.anteriorId, abertoEm: l.abertoEm })),
    ),
  };
}

/** Os quatro indicadores da lista, sobre os abertos. */
export async function resumoDoPainel(p: PortasDoPainel, agora: Date): Promise<ResumoDoPainel> {
  await exigirPainel(p, agora);
  const resumo: ResumoDoPainel = {
    abertos: 0,
    altaAtencaoOuCritico: 0,
    sistemicos: 0,
    semResponsavel: 0,
  };
  for (const c of await p.contagens(ESTADOS_ABERTOS_DO_INSIGHT)) {
    resumo.abertos += c.quantidade;
    if (FAIXAS_DE_ALTA_ATENCAO.includes(c.faixa)) resumo.altaAtencaoOuCritico += c.quantidade;
    if (c.tipo === 'sistemico') resumo.sistemicos += c.quantidade;
    if (!c.comResponsavel) resumo.semResponsavel += c.quantidade;
  }
  return resumo;
}

export async function listarInsights(
  p: PortasDoPainel,
  pedido: {
    estado?: FiltroDeEstadoDoInsight | undefined;
    tipo?: TipoDeInsight | undefined;
    faixa?: string | undefined;
    hotelId?: string | undefined;
  },
  agora: Date,
): Promise<ListaDeInsights> {
  const atribuicoes = await exigirPainel(p, agora);
  const insights = await p.insights({
    estados: estadosDoFiltro(pedido.estado ?? 'abertos'),
    ...(pedido.tipo ? { tipo: pedido.tipo } : {}),
    ...(pedido.faixa ? { faixa: pedido.faixa } : {}),
    ...(pedido.hotelId ? { hotelId: pedido.hotelId } : {}),
  });
  const [ligados, nomes] = await Promise.all([
    insights.length ? p.ligados(insights.map((i) => i.id)) : Promise.resolve([]),
    nomesDe(p, insights),
  ]);
  return {
    insights: insights.map((i) => ({
      ...i,
      ...vinculos(i, ligados),
      podeDecidir: podeDecidirInsight(atribuicoes, alcanceDoInsight(i), agora),
    })),
    nomes,
  };
}

export async function verInsight(
  p: PortasDoPainel,
  insightId: string,
  agora: Date,
): Promise<PaginaDoInsight> {
  const atribuicoes = await exigirPainel(p, agora);
  const insight = await p.insight(insightId);
  if (!insight) throw naoEncontrado();
  const idsDosChamados = chamadosDaEvidencia(insight.evidencia);
  const [ligados, chamados, nomes] = await Promise.all([
    p.ligados([insight.id]),
    idsDosChamados.length ? p.chamados(idsDosChamados) : Promise.resolve([]),
    nomesDe(p, [insight]),
  ]);
  const podeDecidir = podeDecidirInsight(atribuicoes, alcanceDoInsight(insight), agora);
  const daNovaParaAVelha = [...chamados].sort(
    (a, b) => b.abertoEm.getTime() - a.abertoEm.getTime() || a.id.localeCompare(b.id),
  );
  return {
    insight: {
      ...insight,
      ...vinculos(insight, ligados),
      podeDecidir,
      acoes: podeDecidir ? acoesDoEstado(insight.estado) : [],
    },
    chamados: daNovaParaAVelha,
    serie: serieSemanal(
      chamados.map((c) => c.abertoEm),
      agora,
    ),
    nomes: {
      ...nomes,
      hoteis: {
        ...nomes.hoteis,
        ...(await faltando(
          p,
          nomes.hoteis,
          chamados.map((c) => c.hotelId),
        )),
      },
    },
  };
}

/** Os nomes dos hotéis dos chamados que ainda não vieram com o insight. */
async function faltando(
  p: PortasDoPainel,
  conhecidos: Readonly<Record<string, string>>,
  hotelIds: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const novos = unicos(hotelIds).filter((h) => !(h in conhecidos));
  if (!novos.length) return {};
  return (await p.nomes({ hotelIds: novos, bandeiraIds: [], usuarioIds: [] })).hoteis;
}

/**
 * Uma pessoa decide o insight: confere o módulo e o papel, a versão que a tela
 * viu, a transição (decidirNoInsight) e grava o estado novo, o responsável e,
 * no resolvido e no descartado, quem encerrou e quando.
 */
export async function decidirInsight(
  p: PortasDoPainel,
  pedido: PedidoDeDecisao,
  agora: Date,
): Promise<{ versao: number; estado: EstadoDoInsight; responsavelId: string }> {
  const atribuicoes = await exigirPainel(p, agora);
  const atual = await p.insight(pedido.insightId);
  if (!atual) throw naoEncontrado();
  if (atual.versao !== pedido.versao) throw conflitoDeVersao(atual.versao);
  const r = decidirNoInsight(pedido.acao, {
    atribuicoes,
    insight: { estado: atual.estado, alcance: alcanceDoInsight(atual) },
    nota: pedido.nota,
    motivoDeDescarte: pedido.motivoDeDescarte,
    agora,
  });
  const encerra = r.estado === 'resolvido' || r.estado === 'descartado';
  const responsavelId = responsavelDepoisDaAcao(atual.responsavelId, pedido.usuarioId);
  const { versao } = await p.decidir({
    insightId: atual.id,
    acao: pedido.acao,
    versaoEsperada: pedido.versao,
    estado: r.estado,
    nota: r.nota ?? atual.nota,
    motivoDeDescarte: r.motivoDeDescarte,
    responsavelId,
    encerradoEm: encerra ? agora : null,
    encerradoPor: encerra ? pedido.usuarioId : null,
    em: agora,
  });
  return { versao, estado: r.estado, responsavelId };
}

const ativoNaoEncontrado = () => new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');

/**
 * O detalhe do ativo no Intelligence: a atenção dos últimos 90 dias, o último
 * resultado gravado com o detalhe, e os insights do ativo. Quem não decide o
 * insight do hotel do ativo recebe ativo_nao_encontrado, como se não o lesse.
 */
export async function verAtivo(
  p: PortasDoPainel,
  ativoId: string,
  agora: Date,
): Promise<PaginaDoAtivo> {
  const atribuicoes = await exigirPainel(p, agora);
  const ativo = await p.ativo(ativoId);
  if (
    !ativo ||
    !podeDecidirInsight(
      atribuicoes,
      { tipo: 'hotel', hotelId: ativo.hotelId, bandeiraId: ativo.bandeiraId },
      agora,
    )
  ) {
    throw ativoNaoEncontrado();
  }
  const desde = new Date(agora.getTime() - (DIAS_DA_SERIE_DO_ATIVO - 1) * DIA_MS)
    .toISOString()
    .slice(0, 10);
  const [metricas, insights] = await Promise.all([
    p.metricasDoAtivo(ativo.id, desde),
    p.insightsDoEscopo('atencao_ativo', 'ativoId', ativo.id),
  ]);
  const [ligados, nomes] = await Promise.all([
    insights.length ? p.ligados(insights.map((i) => i.id)) : Promise.resolve([]),
    p.nomes({
      hotelIds: [ativo.hotelId],
      bandeiraIds: unicos([ativo.bandeiraId]),
      usuarioIds: unicos(insights.flatMap((i) => [i.responsavelId, i.encerradoPor])),
    }),
  ]);
  return {
    ativo,
    serie: metricas.map((m) => ({ dia: m.dia, atencao: m.atencao, faixa: m.faixa })),
    atual: metricas.at(-1) ?? null,
    insights: insights.map((i) => ({
      ...i,
      ...vinculos(i, ligados),
      podeDecidir: podeDecidirInsight(atribuicoes, alcanceDoInsight(i), agora),
    })),
    nomes,
  };
}
