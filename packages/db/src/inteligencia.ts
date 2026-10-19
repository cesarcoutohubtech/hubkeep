// As portas do Intelligence. As regras ficam no packages/inteligencia, que este
// pacote não importa (ADR-037).
// - O job diário (ADR-036): uma sessão por tenant, com o hk_worker, numa unit
//   of work só (executarComoSistema); o conteúdo está em
//   repositorios/inteligencia.ts.
// - O painel (as telas do 1.0): leitura e decisão com o hk_app e o contexto de
//   quem pede (repositorios/inteligencia-painel.ts).
// - O sinal do hóspede (ADR-047): importação e classificação com o hk_app e o
//   contexto de quem pede, na unit of work (repositorios/inteligencia-sinal.ts).
import type { Contexto } from '@hubkeep/dominio';
import type { AcessoBanco } from './acesso';
import {
  type AtivoDoPainelNoBanco,
  type AtivoEncontradoNoBanco,
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
  ativosPorBusca,
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
  politicasDaSubstituicao,
  politicasDoImpacto,
} from './repositorios/inteligencia-efetividade';
import {
  type ClassificacaoNoBanco,
  type HotelDoSinalNoBanco,
  type ImportacaoNoBanco,
  type LigacaoDoChamadoNoBanco,
  type ReclamacaoParaChamadoNoBanco,
  type ReferenciasDaClassificacaoNoBanco,
  type SinalDaFilaNoBanco,
  type SinalParaClassificarNoBanco,
  classificarSinalNoBanco,
  gravarSinaisNoBanco,
  hotelDoSinal,
  ligarChamadoNoBanco,
  nomesDasUhs,
  reclamacaoParaChamado,
  referenciasDaClassificacao,
  sinaisDoAtivo,
  sinaisDoHotel,
  sinaisPorIds,
  sinalParaClassificar,
} from './repositorios/inteligencia-sinal';
import {
  type PoliticaDoJob,
  type SessaoDoJobDoIntelligence,
  type SinalDoJob,
  sessaoDoJobDoIntelligence,
  sinaisNoTrecho,
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
  /** "Procurar ativo": os ativos sem baixa do termo (normalizado), até `limite`. */
  ativosPorBusca(ctx: Contexto, termo: string, limite: number): Promise<AtivoEncontradoNoBanco[]>;
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
  /** O sinal de substituição: as linhas de inteligencia.substituicao que quem pede lê. */
  politicasDaSubstituicao(ctx: Contexto): Promise<PoliticaDoJob[]>;
  /** O Guest Impact Score (ADR-047): as linhas de inteligencia.impacto_hospede que quem pede lê. */
  politicasDoImpacto(ctx: Contexto): Promise<PoliticaDoJob[]>;
  /** As reclamações do hotel no trecho, sem o texto, como quem pede as lê (ADR-047). */
  sinaisDoHotelNaJanela(
    ctx: Contexto,
    hotelId: string,
    desde: Date,
    ate: Date,
  ): Promise<SinalDoJob[]>;
  intervencoes(
    ctx: Contexto,
    filtro: { codigos: readonly string[]; desde: Date; ativoIds?: readonly string[] },
  ): Promise<ChamadoDaEfetividadeNoBanco[]>;
  historicoDosAtivos(
    ctx: Contexto,
    ativoIds: readonly string[],
    desde: Date,
    ate: Date,
  ): Promise<{ chamados: ChamadoDaEfetividadeNoBanco[]; paradas: ParadaDaEfetividadeNoBanco[] }>;
  /** O sinal do hóspede (ADR-047): o hotel da importação, se quem pede o lê. */
  hotelDoSinal(ctx: Contexto, id: string): Promise<HotelDoSinalNoBanco | null>;
  /** Na unit of work de quem importa: as linhas do lote, a auditoria e o evento. */
  gravarSinais(
    ctx: Contexto,
    i: ImportacaoNoBanco,
  ): Promise<{ loteId: string; inseridos: string[] }>;
  /** A fila de classificação do hotel no recorte, da data mais recente, até `limite`. */
  sinaisDoHotel(
    ctx: Contexto,
    hotelId: string,
    situacao: string,
    limite: number,
  ): Promise<SinalDaFilaNoBanco[]>;
  sinalParaClassificar(ctx: Contexto, id: string): Promise<SinalParaClassificarNoBanco | null>;
  /** As reclamações destes ids que quem pede lê, com o texto, da mais recente, até `limite`. */
  sinaisPorIds(
    ctx: Contexto,
    ids: readonly string[],
    limite: number,
  ): Promise<SinalDaFilaNoBanco[]>;
  /** As reclamações ligadas ao ativo no trecho, com o texto, da mais recente, até `limite`. */
  sinaisDoAtivo(
    ctx: Contexto,
    ativoId: string,
    desde: Date,
    ate: Date,
    limite: number,
  ): Promise<SinalDaFilaNoBanco[]>;
  /** O nome de cada UH destes ids que quem pede lê. */
  nomesDasUhs(ctx: Contexto, ids: readonly string[]): Promise<Record<string, string>>;
  referenciasDaClassificacao(
    ctx: Contexto,
    r: { ativoId: string | null; uhId: string | null; categoriaId: string | null },
  ): Promise<ReferenciasDaClassificacaoNoBanco>;
  /** Na unit of work de quem classifica: a classificação, a auditoria e o evento. */
  classificar(ctx: Contexto, c: ClassificacaoNoBanco): Promise<{ versao: number }>;
  /** A reclamação, se quem pede a lê, com o local do ativo e o chamado já ligado. */
  reclamacaoParaChamado(ctx: Contexto, id: string): Promise<ReclamacaoParaChamadoNoBanco | null>;
  /** Na unit of work de quem abriu o chamado: a ligação (0057), a auditoria e o evento. */
  ligarChamado(ctx: Contexto, l: LigacaoDoChamadoNoBanco): Promise<void>;
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
    ativosPorBusca: (ctx, termo, limite) =>
      banco.withContext(ctx, (tx) => ativosPorBusca(tx, termo, limite)),
    metricasDoAtivo: (ctx, ativoId, desde) =>
      banco.withContext(ctx, (tx) => metricasDoAtivo(tx, ativoId, desde)),
    insightsDoEscopo: (ctx, tipo, chave, valor, limite) =>
      banco.withContext(ctx, (tx) => insightsDoEscopo(tx, tipo, chave, valor, limite)),
    politicasDaEfetividade: (ctx) => banco.withContext(ctx, (tx) => politicasDaEfetividade(tx)),
    politicasDaSubstituicao: (ctx) => banco.withContext(ctx, (tx) => politicasDaSubstituicao(tx)),
    politicasDoImpacto: (ctx) => banco.withContext(ctx, (tx) => politicasDoImpacto(tx)),
    sinaisDoHotelNaJanela: (ctx, hotelId, desde, ate) =>
      banco.withContext(ctx, (tx) => sinaisNoTrecho(tx, desde, ate, hotelId)),
    intervencoes: (ctx, filtro) => banco.withContext(ctx, (tx) => intervencoesNoBanco(tx, filtro)),
    historicoDosAtivos: (ctx, ativoIds, desde, ate) =>
      banco.withContext(ctx, (tx) => historicoDosAtivosNoBanco(tx, ativoIds, desde, ate)),
    hotelDoSinal: (ctx, id) => banco.withContext(ctx, (tx) => hotelDoSinal(tx, id)),
    gravarSinais: (ctx, i) => banco.executar(ctx, (uow) => gravarSinaisNoBanco(uow, i)),
    sinaisDoHotel: (ctx, hotelId, situacao, limite) =>
      banco.withContext(ctx, (tx) => sinaisDoHotel(tx, hotelId, situacao, limite)),
    sinalParaClassificar: (ctx, id) => banco.withContext(ctx, (tx) => sinalParaClassificar(tx, id)),
    sinaisPorIds: (ctx, ids, limite) =>
      banco.withContext(ctx, (tx) => sinaisPorIds(tx, ids, limite)),
    sinaisDoAtivo: (ctx, ativoId, desde, ate, limite) =>
      banco.withContext(ctx, (tx) => sinaisDoAtivo(tx, ativoId, desde, ate, limite)),
    nomesDasUhs: (ctx, ids) => banco.withContext(ctx, (tx) => nomesDasUhs(tx, ids)),
    referenciasDaClassificacao: (ctx, r) =>
      banco.withContext(ctx, (tx) => referenciasDaClassificacao(tx, r)),
    classificar: (ctx, c) => banco.executar(ctx, (uow) => classificarSinalNoBanco(uow, c)),
    reclamacaoParaChamado: (ctx, id) =>
      banco.withContext(ctx, (tx) => reclamacaoParaChamado(tx, id)),
    ligarChamado: (ctx, l) => banco.executar(ctx, (uow) => ligarChamadoNoBanco(uow, l)),
  };
}
