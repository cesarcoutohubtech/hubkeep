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
import { type RegistrosDePoliticas, modulosVigentes } from '@hubkeep/dominio';
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
  hoteisDoDia,
  listaCanonicaDeHoteis,
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
