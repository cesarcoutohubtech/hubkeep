// As reclamações de hóspede nas páginas do insight e do ativo (PR C2 do
// ADR-047; proposta de 17/10/2026, aprovada por Cesar e Kaio):
// - a página do insight sistêmico das reclamações lista as reclamações da
//   evidência (D3), com o total da evidência;
// - a página do ativo lista as reclamações ligadas a ele na janela da
//   política do Guest Impact Score, as confirmadas (que pesam) e as
//   possíveis (que não pesam, D2).
// Quem vê não muda: a página do ativo exige quem decide o insight do hotel
// dele; na do insight, a RLS da app.sinal_hospede filtra com o contexto de
// quem pede, e quem lê o insight mas não as reclamações do hotel vê só o
// total. O texto vem junto, como na fila. Até 50 por lista, as mais
// recentes (detalhe do Kaio).
import { podeDecidirInsight } from './insight';
import {
  type PortasDoPainel,
  ativoNaoEncontrado,
  exigirPainel,
  insightNaoEncontrado,
  unicos,
} from './painel';
import { type PortasDaSubstituicao, impactoDoHotel } from './painel-substituicao';
import { DIA_MS } from './score';
import type { SinalDaFila } from './sinal-hospede';

/** O máximo de reclamações em cada lista, da mais recente para a mais antiga. */
export const LIMITE_DAS_RECLAMACOES = 50;

/** O que as listas de reclamações leem, no contexto de quem pede. */
export interface PortasDasReclamacoes extends PortasDoPainel, PortasDaSubstituicao {
  /** As reclamações destes ids que quem pede lê, da mais recente, até `limite`. */
  sinaisPorIds(ids: readonly string[], limite: number): Promise<readonly SinalDaFila[]>;
  /** As reclamações ligadas ao ativo avaliadas depois de `desde` e até `ate`, até `limite`. */
  sinaisDoAtivo(
    ativoId: string,
    desde: Date,
    ate: Date,
    limite: number,
  ): Promise<readonly SinalDaFila[]>;
  /** O nome de cada UH destes ids que quem pede lê. */
  nomesDasUhs(ids: readonly string[]): Promise<Readonly<Record<string, string>>>;
}

export interface ReclamacoesDoPainel {
  /** As que quem pede lê, da mais recente para a mais antiga, até o limite. */
  sinais: SinalDaFila[];
  /** No insight, quantas a evidência tem; no ativo, null. */
  total: number | null;
  /** Há mais reclamações do que a lista mostra. */
  limitada: boolean;
  /** No ativo, a janela da política do score; no insight, null. */
  janelaDias: number | null;
  nomes: {
    ativos: Readonly<Record<string, string>>;
    pessoas: Readonly<Record<string, string>>;
    uhs: Readonly<Record<string, string>>;
  };
}

/** Os ids das reclamações da evidência do insight sistêmico; null se a evidência não os tem. */
export function sinaisDaEvidencia(evidencia: unknown): string[] | null {
  const ids =
    evidencia && typeof evidencia === 'object'
      ? (evidencia as { sinalIds?: unknown }).sinalIds
      : undefined;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : null;
}

async function comNomes(
  p: PortasDasReclamacoes,
  lidos: readonly SinalDaFila[],
  extra: Pick<ReclamacoesDoPainel, 'total' | 'janelaDias'>,
): Promise<ReclamacoesDoPainel> {
  const sinais = lidos.slice(0, LIMITE_DAS_RECLAMACOES);
  const [nomes, uhs] = await Promise.all([
    p.nomes({
      hotelIds: [],
      bandeiraIds: [],
      usuarioIds: unicos(sinais.map((s) => s.classificadoPor)),
      ativoIds: unicos(sinais.map((s) => s.ativoId)),
    }),
    p.nomesDasUhs(unicos(sinais.map((s) => s.uhId))),
  ]);
  return {
    sinais,
    limitada: lidos.length > LIMITE_DAS_RECLAMACOES,
    ...extra,
    nomes: { ativos: nomes.ativos, pessoas: nomes.pessoas, uhs },
  };
}

/**
 * As reclamações da evidência do insight, como quem pede as lê; null quando o
 * insight não é o da regra das reclamações (a evidência sem `sinalIds`).
 */
export async function reclamacoesDoInsight(
  p: PortasDasReclamacoes,
  insightId: string,
  agora: Date,
): Promise<ReclamacoesDoPainel | null> {
  await exigirPainel(p, agora);
  const insight = await p.insight(insightId);
  if (!insight) throw insightNaoEncontrado();
  const ids = sinaisDaEvidencia(insight.evidencia);
  if (ids === null) return null;
  const lidos = ids.length ? await p.sinaisPorIds(ids, LIMITE_DAS_RECLAMACOES + 1) : [];
  return comNomes(p, lidos, { total: ids.length, janelaDias: null });
}

/**
 * As reclamações ligadas ao ativo (possível ou confirmada) na janela da
 * política do Guest Impact Score do hotel dele. Quem não decide o insight do
 * hotel do ativo recebe ativo_nao_encontrado, como no detalhe do ativo.
 */
export async function reclamacoesDoAtivo(
  p: PortasDasReclamacoes,
  ativoId: string,
  agora: Date,
): Promise<ReclamacoesDoPainel> {
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
  const config = impactoDoHotel(await p.politicasDoImpacto(), {
    id: ativo.hotelId,
    bandeiraId: ativo.bandeiraId,
  });
  const lidos = await p.sinaisDoAtivo(
    ativo.id,
    new Date(agora.getTime() - config.janelaDias * DIA_MS),
    agora,
    LIMITE_DAS_RECLAMACOES + 1,
  );
  return comNomes(p, lidos, { total: null, janelaDias: config.janelaDias });
}
