// O job diário de um tenant (ADR-036), em código puro: orquestra a leitura, o
// cálculo do dia (calcularDia), a decisão sobre cada detecção (decidirDeteccao)
// e a gravação, sempre por portas. O módulo não lê nem grava banco: as portas
// são implementadas na ligação do servidor do web (a pasta do módulo em
// apps/web/src/servidor/modulos/inteligencia/), com o hk_worker, um tenant por
// transação e a unit of work que grava auditoria e evento. Nos testes, entram
// as implementações em memória (test/apoio-job.ts).
//
// - Um dia calculado uma vez não é gravado de novo: rodar o job duas vezes no
//   mesmo dia não duplica a métrica, e o insight já aberto só é atualizado.
// - Recálculo (`recalculo: true`): grava outra linha por ativo, com o número de
//   cálculo seguinte e a marca de recálculo, e não abre nem atualiza insight. O
//   `agora` de um dia passado é o fim dele (fimDoDia).
// - O job nunca muda o estado de um insight (ADR-033).
// - Só roda no tenant com o módulo `inteligencia` vigente em `agora`
//   (`licenca.modulo`, I7; adendo ao ADR-026 de 10/10/2026): sem ele, não lê
//   mais nada nem grava. No recálculo, vale a vigência no dia recalculado.
// - A chave de unicidade do insight (família mais o SHA-256 da lista canônica
//   de hotéis) é montada por quem grava, com node:crypto ou sha256(): nada de
//   hash aqui.
// - Cada execução num tenant com o módulo vigente deixa um registro
//   (`registrarExecucao`), mesmo sem gravar nada: quem disparou, o resumo, as
//   versões das fórmulas e a versão da política de cada hotel (Cesar,
//   10/10/2026). Quem grava o transforma em auditoria, na unit of work do dia.
//   O tenant sem o módulo não ganha registro: o job não grava nada nele.
// - A leitura dos ativos e dos chamados começa em `inicioDaLeitura`, calculado
//   com as políticas já resolvidas; o chamado vira corretiva por
//   `corretivasDosChamados` (fonte.ts).
import { type ModuloContratado, modulosVigentes } from '@hubkeep/dominio';
import type { LinhaDaMetricaDiaria } from './agregacao';
import {
  type AtivoDoDia,
  type DeteccaoDoDia,
  type HotelDoDia,
  VERSAO_DE_POLITICA_PADRAO,
  calcularDia,
} from './dia';
import { type ChamadoDaFonte, corretivasDosChamados, inicioDaLeitura } from './fonte';
import {
  type Corretiva,
  type LocalAnalisado,
  aceiteDaOs,
  conclusaoEReaberturas,
} from './historico';
import { type InsightExistente, decidirDeteccao } from './insight';
import { VERSAO_ATENCAO } from './atencao';
import { VERSAO_REINCIDENCIA } from './reincidencia';
import { type ConfigSistemico, PADRAO_SISTEMICO, VERSAO_SISTEMICO } from './sistemico';

/** O que o job lê do tenant. Todas as leituras são do contexto dele (RLS). */
export interface FonteDoJob {
  /** Os módulos contratados do tenant (`licenca.modulo`, I7), lidos pelo hk_worker no tenant do job. */
  modulos(): Promise<readonly ModuloContratado[]>;
  /**
   * Os hotéis a calcular, com as políticas já resolvidas e a versão delas. O
   * registro é o do tenant (`registrosDePoliticasPorModulo(...).doTenant`), com
   * as chaves `inteligencia.*`, porque o job só chega aqui com o módulo vigente.
   */
  hoteis(): Promise<readonly HotelDoDia[]>;
  /**
   * Os ativos que já existiam em `agora`, menos os baixados antes de `desde`
   * (o baixado na janela ainda conta na base do sinal sistêmico), com as
   * paradas que começaram até `agora` e não terminaram antes de `desde`.
   */
  ativos(agora: Date, desde: Date): Promise<readonly AtivoDoDia[]>;
  /**
   * Os chamados abertos até `agora` que foram abertos depois de `desde` ou têm
   * transição de OS depois de `desde`, com todas as OS e as transições delas.
   */
  corretivas(agora: Date, desde: Date): Promise<readonly ChamadoDaFonte[]>;
  locais(): Promise<readonly LocalAnalisado[]>;
  /** A política `inteligencia.sistemico` resolvida para o grupo, ou undefined para o padrão. */
  politicaSistemica(): Promise<ConfigSistemico | undefined>;
  /** Os insights existentes (abertos e os encerrados recentes), na forma que a decisão compara. */
  insights(): Promise<readonly InsightExistente[]>;
  /** O maior número de cálculo já gravado de cada ativo no dia (`AAAA-MM-DD`). */
  calculosDoDia(dia: string): Promise<ReadonlyMap<string, number>>;
}

export interface NovoInsight {
  deteccao: DeteccaoDoDia;
  /** O insight a que o novo se liga: o que ele substitui, ou de que é recorrência. */
  anteriorId: string | null;
  agora: Date;
}

export interface AtualizacaoDeInsight {
  insightId: string;
  deteccao: DeteccaoDoDia;
  subiuDeFaixa: boolean;
  agora: Date;
}

/** O que o job grava. Só insere métrica; o insight, só abre e atualiza a detecção. */
export interface GravacaoDoJob {
  gravarMetricas(linhas: readonly LinhaDaMetricaDiaria[]): Promise<void>;
  abrirInsight(novo: NovoInsight): Promise<void>;
  atualizarInsight(atualizacao: AtualizacaoDeInsight): Promise<void>;
  /** O registro da execução, que quem grava põe na auditoria. */
  registrarExecucao(execucao: ExecucaoDoJob): Promise<void>;
}

export interface PortasDoJob {
  fonte: FonteDoJob;
  gravacao: GravacaoDoJob;
}

export interface ParametrosDoJob {
  agora: Date;
  recalculo?: boolean;
  /** Quem disparou: 'cron', ou o id do usuário que pediu o recálculo. Sem o campo, 'cron'. */
  disparadoPor?: string;
}

export interface ResumoDoJob {
  dia: string;
  recalculo: boolean;
  /** O tenant sem o módulo vigente em `agora`: o job não leu o resto nem gravou. */
  semModulo: boolean;
  ativos: number;
  metricasGravadas: number;
  /** Ativos cujo dia já estava gravado: o job não grava de novo (fora do recálculo). */
  metricasJaGravadas: number;
  insightsAbertos: number;
  insightsAtualizados: number;
  insightsIgnorados: number;
}

/** O que fica registrado de cada execução num tenant com o módulo vigente. */
export interface ExecucaoDoJob extends ResumoDoJob {
  disparadoPor: string;
  /** As versões das fórmulas usadas no dia. */
  versoesDeFormula: { reincidencia: number; atencao: number; sistemico: number };
  /** A versão da política de cada hotel do dia (`HotelDoDia.versaoPolitica`, ou `padrao`). */
  versoesDePolitica: Readonly<Record<string, string>>;
}

export const VERSOES_DE_FORMULA_DO_JOB: ExecucaoDoJob['versoesDeFormula'] = {
  reincidencia: VERSAO_REINCIDENCIA,
  atencao: VERSAO_ATENCAO,
  sistemico: VERSAO_SISTEMICO,
};

const naOrdemDoJob = (a: DeteccaoDoDia, b: DeteccaoDoDia): number =>
  a.familia.localeCompare(b.familia) || a.hotelIds.join(',').localeCompare(b.hotelIds.join(','));

export async function executarDiaDoTenant(
  portas: PortasDoJob,
  p: ParametrosDoJob,
): Promise<ResumoDoJob> {
  const { fonte, gravacao } = portas;
  const recalculo = p.recalculo ?? false;
  if (!modulosVigentes(await fonte.modulos(), p.agora).has('inteligencia')) {
    return {
      dia: p.agora.toISOString().slice(0, 10),
      recalculo,
      semModulo: true,
      ativos: 0,
      metricasGravadas: 0,
      metricasJaGravadas: 0,
      insightsAbertos: 0,
      insightsAtualizados: 0,
      insightsIgnorados: 0,
    };
  }
  const [hoteis, locais, sistemico, insights] = await Promise.all([
    fonte.hoteis(),
    fonte.locais(),
    fonte.politicaSistemica(),
    fonte.insights(),
  ]);
  const desde = inicioDaLeitura(hoteis, sistemico ?? PADRAO_SISTEMICO, p.agora);
  const [ativos, chamados] = await Promise.all([
    fonte.ativos(p.agora, desde),
    fonte.corretivas(p.agora, desde),
  ]);

  const corretivas: Corretiva[] = corretivasDosChamados(chamados).map(({ transicoes, ...c }) => ({
    ...c,
    ...conclusaoEReaberturas(transicoes, p.agora),
    aceitaEm: aceiteDaOs(transicoes, p.agora),
  }));
  const resultado = calcularDia({
    agora: p.agora,
    recalculo,
    hoteis,
    ativos,
    corretivas,
    locais,
    ...(sistemico ? { sistemico } : {}),
  });

  const calculos = await fonte.calculosDoDia(resultado.dia);
  const linhas: LinhaDaMetricaDiaria[] = [];
  let jaGravadas = 0;
  for (const m of resultado.metricas) {
    const anterior = calculos.get(m.ativoId);
    if (anterior !== undefined && !recalculo) {
      jaGravadas += 1;
      continue;
    }
    linhas.push({ ...m, calculo: (anterior ?? 0) + 1 });
  }
  if (linhas.length) await gravacao.gravarMetricas(linhas);

  const resumo: ResumoDoJob = {
    dia: resultado.dia,
    recalculo,
    semModulo: false,
    ativos: resultado.ativos.length,
    metricasGravadas: linhas.length,
    metricasJaGravadas: jaGravadas,
    insightsAbertos: 0,
    insightsAtualizados: 0,
    insightsIgnorados: 0,
  };

  // O recálculo não abre nem atualiza insight.
  for (const deteccao of recalculo ? [] : [...resultado.deteccoes].sort(naOrdemDoJob)) {
    const decisao = decidirDeteccao(insights, deteccao, p.agora);
    if (decisao.acao === 'abrir') {
      await gravacao.abrirInsight({ deteccao, anteriorId: decisao.anteriorId, agora: p.agora });
      resumo.insightsAbertos += 1;
    } else if (decisao.acao === 'atualizar') {
      await gravacao.atualizarInsight({
        insightId: decisao.insightId,
        deteccao,
        subiuDeFaixa: decisao.subiuDeFaixa,
        agora: p.agora,
      });
      resumo.insightsAtualizados += 1;
    } else {
      resumo.insightsIgnorados += 1;
    }
  }

  await gravacao.registrarExecucao({
    ...resumo,
    disparadoPor: p.disparadoPor ?? 'cron',
    versoesDeFormula: VERSOES_DE_FORMULA_DO_JOB,
    versoesDePolitica: Object.fromEntries(
      [...hoteis]
        .sort((a, b) => a.hotelId.localeCompare(b.hotelId))
        .map((h) => [h.hotelId, h.versaoPolitica ?? VERSAO_DE_POLITICA_PADRAO]),
    ),
  });
  return resumo;
}
