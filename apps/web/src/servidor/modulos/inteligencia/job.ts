// A ligação do job diário do Intelligence (ADR-036): as portas do
// executarDiaDoTenant sobre a sessão do packages/db (hk_worker, um tenant por
// transação, unit of work com auditoria e evento). Aqui só a tradução das
// linhas para o motor e a chave do insight; as regras são do
// @hubkeep/inteligencia (fonte.ts e job.ts).
//
// A chave de unicidade do insight (ADR-033, condição do hash do Cesar de
// 07/10/2026) é a família, '|hoteis=' e o SHA-256, em hexadecimal minúsculo,
// da lista canônica de hotéis separada por vírgula, em UTF-8. O pgTAP 031
// confere o mesmo vetor com o sha256() do banco.
import { createHash } from 'node:crypto';
import type { Relogio } from '@hubkeep/aplicacao';
import type { PortaDoJobDoIntelligence, SessaoDoJobDoIntelligence } from '@hubkeep/db';
import {
  type ModuloContratado,
  type RegistrosDePoliticas,
  modulosVigentes,
} from '@hubkeep/dominio';
import {
  CHAVES_DO_JOB,
  type InsightExistente,
  type PortasDoJob,
  type ResumoDoJob,
  SEPARADOR_DE_HOTEIS,
  ehCriticidade,
  ehEstadoDoInsight,
  ehMotivoDeDescarte,
  executarDiaDoTenant,
  fimDoDia,
  fimDoDiaNoFuso,
  hoteisDoDia,
  listaCanonicaDeHoteis,
  politicaDoSinalDoGrupo,
  politicaSistemicaDoGrupo,
} from '@hubkeep/inteligencia';

/** A chave de unicidade do insight: `familia|hoteis=<sha256 da lista canônica>`. */
export function chaveDoInsight(familia: string, hotelIds: readonly string[]): string {
  const lista = listaCanonicaDeHoteis(hotelIds).join(SEPARADOR_DE_HOTEIS);
  return `${familia}|hoteis=${createHash('sha256').update(lista, 'utf8').digest('hex')}`;
}

function umaVez<T>(ler: () => Promise<T>): () => Promise<T> {
  let valor: Promise<T> | undefined;
  return () => (valor ??= ler());
}

function insightExistente(i: Awaited<ReturnType<SessaoDoJobDoIntelligence['insights']>>[number]) {
  if (!ehEstadoDoInsight(i.estado)) throw new Error(`Estado de insight desconhecido: ${i.estado}`);
  const motivo = i.motivoDeDescarte;
  if (motivo !== null && !ehMotivoDeDescarte(motivo)) {
    throw new Error(`Motivo de descarte desconhecido: ${motivo}`);
  }
  return {
    id: i.id,
    familia: i.familia,
    hotelIds: listaCanonicaDeHoteis(i.hotelIds),
    estado: i.estado,
    faixa: i.faixa,
    abertoEm: i.abertoEm,
    anteriorId: i.anteriorId,
    encerradoEm: i.encerradoEm,
    motivoDeDescarte: motivo,
  } satisfies InsightExistente;
}

/**
 * As portas do job sobre a sessão de um tenant. Os módulos e as políticas são
 * lidos uma vez; o registro de políticas é o do tenant, com os módulos
 * vigentes em `agora` (no recálculo, no dia recalculado).
 */
export function portasDoJob(
  sessao: SessaoDoJobDoIntelligence,
  registros: RegistrosDePoliticas,
  agora: Date,
): PortasDoJob {
  const modulos = umaVez(() => sessao.modulos());
  const politicas = umaVez(() => sessao.politicas(CHAVES_DO_JOB));
  const registro = async () => registros.doTenant(modulosVigentes(await modulos(), agora));
  return {
    fonte: {
      modulos,
      hoteis: async () => hoteisDoDia(await sessao.hoteis(), await politicas(), await registro()),
      ativos: async (ate, desde) =>
        (await sessao.ativos(ate, desde)).map((a) => ({
          ...a,
          criticidade: ehCriticidade(a.criticidade) ? a.criticidade : null,
        })),
      corretivas: (ate, desde) => sessao.chamados(ate, desde),
      locais: () => sessao.locais(),
      politicaSistemica: async () => politicaSistemicaDoGrupo(await politicas(), await registro()),
      insights: async () => (await sessao.insights()).map(insightExistente),
      calculosDoDia: (dia) => sessao.calculosDoDia(dia),
      reclamacoes: (ate, desde) => sessao.reclamacoes(ate, desde),
      politicaDoSinal: async () => politicaDoSinalDoGrupo(await politicas(), await registro()),
    },
    gravacao: {
      gravarMetricas: (linhas) => sessao.gravarMetricas(linhas),
      abrirInsight: async ({ deteccao: d, anteriorId, agora: em }) => {
        await sessao.abrirInsight({
          tipo: d.tipo,
          familia: d.familia,
          chave: chaveDoInsight(d.familia, d.hotelIds),
          hotelId: d.alcance.tipo === 'hotel' ? d.alcance.hotelId : null,
          bandeiraId: d.alcance.bandeiraId,
          hotelIds: listaCanonicaDeHoteis(d.hotelIds),
          escopo: d.escopo,
          faixa: d.faixa,
          valor: d.valor,
          versaoScore: d.versao,
          detalhe: d.detalhe,
          evidencia: { corretivaIds: d.corretivaIds },
          anteriorId,
          em,
        });
      },
      atualizarInsight: ({ insightId, deteccao: d, subiuDeFaixa, agora: em }) =>
        sessao.atualizarInsight({
          insightId,
          faixa: d.faixa,
          valor: d.valor,
          versaoScore: d.versao,
          detalhe: d.detalhe,
          evidencia: { corretivaIds: d.corretivaIds },
          subiuDeFaixa,
          em,
        }),
      registrarExecucao: (execucao) => sessao.registrarExecucao(execucao),
      apagarTextos: (ate, em) => sessao.apagarTextos(ate, em),
    },
  };
}

export interface DepsDoJobDoDia {
  porta: PortaDoJobDoIntelligence;
  registros: RegistrosDePoliticas;
  relogio: Relogio;
}

/** O job do dia de um tenant: lê, calcula e grava numa transação do tenant. */
export function criarJobDoDia(deps: DepsDoJobDoDia): (tenantId: string) => Promise<ResumoDoJob> {
  return (tenantId) => {
    const agora = deps.relogio.agora();
    return deps.porta.noTenant(tenantId, (sessao) =>
      executarDiaDoTenant(portasDoJob(sessao, deps.registros, agora), { agora }),
    );
  };
}

/** De UTC-12 a UTC+14: o dia D local cabe entre D-1 10:00 UTC e D+1 12:00 UTC. */
const HORA_MS = 3_600_000;

/**
 * O módulo pode estar vigente em algum momento do dia D em algum fuso: o
 * contrato cruza a janela de D em todos os fusos. É só a porta de entrada,
 * para o tenant sem o módulo não ler mais que os módulos; a vigência exata é a
 * do fim do dia em cada fuso, conferida pelo job.
 */
function talvezVigenteNoDia(modulos: readonly ModuloContratado[], fimUtc: Date): boolean {
  const ate = fimUtc.getTime() + 12 * HORA_MS;
  const desde = fimUtc.getTime() - 38 * HORA_MS;
  return modulos.some(
    (m) =>
      m.modulo === 'inteligencia' &&
      m.inicio.getTime() <= ate &&
      (m.fim === null || m.fim.getTime() >= desde),
  );
}

/** A sessão com os módulos já lidos e, se dados, só estes hotéis. */
function sessaoCom(
  sessao: SessaoDoJobDoIntelligence,
  modulos: ModuloContratado[],
  hoteis?: Awaited<ReturnType<SessaoDoJobDoIntelligence['hoteis']>>,
): SessaoDoJobDoIntelligence {
  const s = Object.create(sessao) as SessaoDoJobDoIntelligence;
  s.modulos = async () => modulos;
  if (hoteis) s.hoteis = async () => hoteis;
  return s;
}

const somar = (a: ResumoDoJob, b: ResumoDoJob): ResumoDoJob => ({
  dia: a.dia,
  recalculo: a.recalculo,
  semModulo: a.semModulo && b.semModulo,
  ativos: a.ativos + b.ativos,
  metricasGravadas: a.metricasGravadas + b.metricasGravadas,
  metricasJaGravadas: a.metricasJaGravadas + b.metricasJaGravadas,
  insightsAbertos: a.insightsAbertos + b.insightsAbertos,
  insightsAtualizados: a.insightsAtualizados + b.insightsAtualizados,
  insightsIgnorados: a.insightsIgnorados + b.insightsIgnorados,
  textosApagados: a.textosApagados + b.textosApagados,
});

/**
 * O recálculo de um dia passado num tenant (ADR-036; atividade 2c). O dia é o
 * local de cada hotel (glossário de métricas, divergência a, decisão 3 de
 * Cesar e Kaio de 13/10/2026): roda uma vez por fuso distinto entre os hotéis,
 * cada vez só com os hotéis daquele fuso, com o `agora` no fim do dia local
 * (fimDoDiaNoFuso) e a vigência do módulo nesse instante. O motor grava outra
 * linha por ativo com o número de cálculo seguinte, a marca de recálculo e as
 * versões das fórmulas de hoje, e não abre nem atualiza insight, então o sinal
 * sistêmico não depende dos fusos. Cada rodada deixa o próprio registro na
 * auditoria, com `disparadoPor`; o resumo devolvido soma as rodadas.
 */
export function criarRecalculoDoDia(
  deps: Omit<DepsDoJobDoDia, 'relogio'>,
): (tenantId: string, dia: string, disparadoPor: string) => Promise<ResumoDoJob> {
  return (tenantId, dia, disparadoPor) => {
    const fimUtc = fimDoDia(dia);
    return deps.porta.noTenant(tenantId, async (sessao) => {
      const modulos = await sessao.modulos();
      const rodar = (s: SessaoDoJobDoIntelligence, agora: Date) =>
        executarDiaDoTenant(portasDoJob(s, deps.registros, agora), {
          agora,
          recalculo: true,
          disparadoPor,
        });
      if (!talvezVigenteNoDia(modulos, fimUtc)) return rodar(sessaoCom(sessao, modulos), fimUtc);
      const hoteis = await sessao.hoteis();
      const fusos = [...new Set(hoteis.map((h) => h.fuso))].sort();
      if (!fusos.length) return rodar(sessaoCom(sessao, modulos, hoteis), fimUtc);
      let resumo: ResumoDoJob | undefined;
      for (const fuso of fusos) {
        const r = await rodar(
          sessaoCom(
            sessao,
            modulos,
            hoteis.filter((h) => h.fuso === fuso),
          ),
          fimDoDiaNoFuso(dia, fuso),
        );
        resumo = resumo ? somar(resumo, r) : r;
      }
      return { ...(resumo as ResumoDoJob), dia };
    });
  };
}
