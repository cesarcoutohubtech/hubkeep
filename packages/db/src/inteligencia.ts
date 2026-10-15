// As portas do Intelligence. As regras ficam no packages/inteligencia, que este
// pacote não importa (ADR-037).
// - O job diário (ADR-036): uma sessão por tenant, com o hk_worker, numa unit
//   of work só (executarComoSistema); o conteúdo está em
//   repositorios/inteligencia.ts.
// - O painel (as telas do 1.0): leitura e decisão com o hk_app e o contexto de
//   quem pede (repositorios/inteligencia-painel.ts).
import type { Contexto } from '@hubkeep/dominio';
import type { AcessoBanco } from './acesso';
import {
  type AtivoDoPainelNoBanco,
  type ChamadoDoInsightNoBanco,
  type ContagemDeInsightsNoBanco,
  type DecisaoNoBanco,
  type FiltroDeInsightsNoBanco,
  type InsightComEvidenciaNoBanco,
  type InsightDoPainelNoBanco,
  type InsightLigadoNoBanco,
  type MetricaDoPainelNoBanco,
  type NomesDoPainelNoBanco,
  ativoDoPainel,
  chamadosDoInsight,
  contagensDeInsights,
  decidirInsightNoBanco,
  insightDoPainel,
  insightsDoPainel,
  insightsDoEscopo,
  insightsLigados,
  metricasDoAtivo,
  nomesDoPainel,
} from './repositorios/inteligencia-painel';
import {
  type ChamadoDaEfetividadeNoBanco,
  type ParadaDaEfetividadeNoBanco,
  historicoDosAtivosNoBanco,
  intervencoesNoBanco,
  politicasDaEfetividade,
} from './repositorios/inteligencia-efetividade';
import {
  type PoliticaDoJob,
  type SessaoDoJobDoIntelligence,
  sessaoDoJobDoIntelligence,
} from './repositorios/inteligencia';

export interface PortaDoJobDoIntelligence {
  /** Roda `fn` numa transação do tenant: tudo o que ela gravar entra junto, ou nada. */
  noTenant<T>(tenantId: string, fn: (sessao: SessaoDoJobDoIntelligence) => Promise<T>): Promise<T>;
}

export function criarPortaDoJobDoIntelligence(banco: AcessoBanco): PortaDoJobDoIntelligence {
  return {
    noTenant: (tenantId, fn) =>
      banco.executarComoSistema({ tenantId }, (uow) => fn(sessaoDoJobDoIntelligence(uow))),
  };
}

export interface PortaDoPainelDoIntelligence {
  contagens(ctx: Contexto, estados: readonly string[]): Promise<ContagemDeInsightsNoBanco[]>;
  insights(
    ctx: Contexto,
    filtro: FiltroDeInsightsNoBanco,
    limite: number,
  ): Promise<InsightDoPainelNoBanco[]>;
  insight(ctx: Contexto, id: string): Promise<InsightComEvidenciaNoBanco | null>;
  ligados(ctx: Contexto, ids: readonly string[]): Promise<InsightLigadoNoBanco[]>;
  chamados(ctx: Contexto, ids: readonly string[]): Promise<ChamadoDoInsightNoBanco[]>;
  nomes(
    ctx: Contexto,
    p: {
      hotelIds: readonly string[];
      bandeiraIds: readonly string[];
      usuarioIds: readonly string[];
      ativoIds: readonly string[];
    },
  ): Promise<NomesDoPainelNoBanco>;
  /** Na unit of work de quem decide: o estado, a auditoria e o evento. */
  decidir(ctx: Contexto, d: DecisaoNoBanco): Promise<{ versao: number }>;
  ativo(ctx: Contexto, id: string): Promise<AtivoDoPainelNoBanco | null>;
  metricasDoAtivo(ctx: Contexto, ativoId: string, desde: string): Promise<MetricaDoPainelNoBanco[]>;
  insightsDoEscopo(
    ctx: Contexto,
    tipo: string,
    chave: string,
    valor: string,
    limite: number,
  ): Promise<InsightDoPainelNoBanco[]>;
  /** A efetividade (adendo ao ADR-033): as linhas de inteligencia.efetividade que quem pede lê. */
  politicasDaEfetividade(ctx: Contexto): Promise<PoliticaDoJob[]>;
  intervencoes(
    ctx: Contexto,
    filtro: { codigos: readonly string[]; desde: Date; ativoId?: string },
  ): Promise<ChamadoDaEfetividadeNoBanco[]>;
  historicoDosAtivos(
    ctx: Contexto,
    ativoIds: readonly string[],
    desde: Date,
    ate: Date,
  ): Promise<{ chamados: ChamadoDaEfetividadeNoBanco[]; paradas: ParadaDaEfetividadeNoBanco[] }>;
}

export function criarPortaDoPainelDoIntelligence(banco: AcessoBanco): PortaDoPainelDoIntelligence {
  return {
    contagens: (ctx, estados) => banco.withContext(ctx, (tx) => contagensDeInsights(tx, estados)),
    insights: (ctx, filtro, limite) =>
      banco.withContext(ctx, (tx) => insightsDoPainel(tx, filtro, limite)),
    insight: (ctx, id) => banco.withContext(ctx, (tx) => insightDoPainel(tx, id)),
    ligados: (ctx, ids) => banco.withContext(ctx, (tx) => insightsLigados(tx, ids)),
    chamados: (ctx, ids) => banco.withContext(ctx, (tx) => chamadosDoInsight(tx, ids)),
    nomes: (ctx, p) => banco.withContext(ctx, (tx) => nomesDoPainel(tx, p)),
    decidir: (ctx, d) => banco.executar(ctx, (uow) => decidirInsightNoBanco(uow, d)),
    ativo: (ctx, id) => banco.withContext(ctx, (tx) => ativoDoPainel(tx, id)),
    metricasDoAtivo: (ctx, ativoId, desde) =>
      banco.withContext(ctx, (tx) => metricasDoAtivo(tx, ativoId, desde)),
    insightsDoEscopo: (ctx, tipo, chave, valor, limite) =>
      banco.withContext(ctx, (tx) => insightsDoEscopo(tx, tipo, chave, valor, limite)),
    politicasDaEfetividade: (ctx) => banco.withContext(ctx, (tx) => politicasDaEfetividade(tx)),
    intervencoes: (ctx, filtro) => banco.withContext(ctx, (tx) => intervencoesNoBanco(tx, filtro)),
    historicoDosAtivos: (ctx, ativoIds, desde, ate) =>
      banco.withContext(ctx, (tx) => historicoDosAtivosNoBanco(tx, ativoIds, desde, ate)),
  };
}
