// A intervenção da efetividade (adendo ao ADR-033 de 15/10/2026, aprovado por
// Cesar e Kaio): a OS corretiva concluída cujo código de solução
// (`app.os.codigo_solucao_id`, I6) está na lista `codigosDeIntervencao` da
// política `inteligencia.efetividade` do hotel. A lista guarda a chave padrão
// do código (`app.codigo_manutencao.chave_padrao`) ou o id do código criado
// pelo grupo; o padrão é só "Troca do equipamento".
//
// - A data da intervenção é a conclusão final da OS (`conclusaoEReaberturas`):
//   reaberta e não concluída de novo, não é intervenção.
// - O chamado cancelado, a OS cancelada e o chamado sem ativo ficam fora: a
//   efetividade do 1.0 é por ativo; a intervenção de área fica fora do 1.0.
// - A política resolve por hotel (hotel → bandeira → grupo → padrão), como o
//   registro de políticas do núcleo; a linha fora do formato não resolve.
//
// Quem lê o banco entrega as linhas como estão; aqui só código puro.
import { aceiteDaOs, conclusaoEReaberturas, type Parada } from '@hubkeep/dominio';
import {
  type ConfigEfetividade,
  type Efetividade,
  PADRAO_EFETIVIDADE,
  codigosDeIntervencao,
  efetividadeAntesDepois,
} from './efetividade';
import {
  type ChamadoDaFonte,
  type LinhaDePolitica,
  type OsDaFonte,
  corretivasDosChamados,
  niveisDoHotel,
  osDoChamado,
} from './fonte';
import type { Corretiva } from './historico';
import { valorValidoDoIntelligence } from './politicas';

export const CHAVE_DA_EFETIVIDADE = 'inteligencia.efetividade';

/** Uma OS do chamado, com o código de solução. */
export interface OsDaEfetividade extends OsDaFonte {
  /** `app.os.codigo_solucao_id` (I6); null sem código. */
  codigoSolucaoId: string | null;
  /** A chave padrão do código de solução; null no código criado pelo grupo ou sem código. */
  codigoSolucaoChave: string | null;
}

/** Um chamado com as OS dele e a bandeira do hotel, para resolver a política. */
export interface ChamadoDaEfetividade extends Omit<ChamadoDaFonte, 'os'> {
  bandeiraId: string | null;
  os: readonly OsDaEfetividade[];
}

export interface Intervencao {
  /** O chamado da OS da intervenção. */
  chamadoId: string;
  hotelId: string;
  bandeiraId: string | null;
  ativoId: string;
  /** A conclusão final da OS. */
  em: Date;
  codigoSolucaoId: string;
  executadoPor: OsDaFonte['executadoPor'];
  fornecedorId: string | null;
  custoInformado: number | null;
}

/** O código da OS está na lista, pela chave padrão ou pelo id. */
export const ehCodigoDeIntervencao = (
  os: Pick<OsDaEfetividade, 'codigoSolucaoId' | 'codigoSolucaoChave'>,
  codigos: readonly string[],
): boolean =>
  os.codigoSolucaoId !== null &&
  (codigos.includes(os.codigoSolucaoId) ||
    (os.codigoSolucaoChave !== null && codigos.includes(os.codigoSolucaoChave)));

/** A política da efetividade do hotel: a primeira linha válida do hotel, da bandeira e do grupo. */
export function efetividadeDoHotel(
  linhas: readonly LinhaDePolitica[],
  hotel: { id: string; bandeiraId: string | null },
): ConfigEfetividade {
  const valida = niveisDoHotel(linhas, CHAVE_DA_EFETIVIDADE, hotel).find((l) =>
    valorValidoDoIntelligence(CHAVE_DA_EFETIVIDADE, l.valor),
  );
  return (valida?.valor as ConfigEfetividade | undefined) ?? PADRAO_EFETIVIDADE;
}

/** Todos os códigos que alguma política do tenant (ou o padrão) conta: o filtro da leitura. */
export function codigosDoTenant(linhas: readonly LinhaDePolitica[]): string[] {
  const codigos = new Set(codigosDeIntervencao(PADRAO_EFETIVIDADE));
  for (const l of linhas) {
    if (
      l.chave !== CHAVE_DA_EFETIVIDADE ||
      !valorValidoDoIntelligence(CHAVE_DA_EFETIVIDADE, l.valor)
    )
      continue;
    for (const c of codigosDeIntervencao(l.valor as ConfigEfetividade)) codigos.add(c);
  }
  return [...codigos].sort();
}

/**
 * As intervenções dos chamados, da mais recente para a mais antiga, cada uma
 * pela lista do próprio hotel, concluídas até `agora` e depois de `desde`.
 */
export function intervencoesDosChamados(
  chamados: readonly ChamadoDaEfetividade[],
  configDoHotel: (c: ChamadoDaEfetividade) => ConfigEfetividade,
  desde: Date,
  agora: Date,
): Intervencao[] {
  const intervencoes: Intervencao[] = [];
  for (const c of chamados) {
    if (c.estado === 'cancelado' || c.ativoId === null) continue;
    const os = osDoChamado(c.os);
    if (!os || os.estado === 'cancelada' || os.codigoSolucaoId === null) continue;
    if (!ehCodigoDeIntervencao(os, codigosDeIntervencao(configDoHotel(c)))) continue;
    const { concluidaEm } = conclusaoEReaberturas(os.transicoes, agora);
    if (!concluidaEm || concluidaEm.getTime() <= desde.getTime()) continue;
    intervencoes.push({
      chamadoId: c.id,
      hotelId: c.hotelId,
      bandeiraId: c.bandeiraId,
      ativoId: c.ativoId,
      em: concluidaEm,
      codigoSolucaoId: os.codigoSolucaoId,
      executadoPor: os.executadoPor,
      fornecedorId: os.fornecedorId,
      custoInformado: os.custoInformado,
    });
  }
  return intervencoes.sort(
    (a, b) => b.em.getTime() - a.em.getTime() || a.chamadoId.localeCompare(b.chamadoId),
  );
}

/** As corretivas do ativo, com a conclusão, as reaberturas e o aceite na data do cálculo. */
export function corretivasDoAtivo(
  chamados: readonly ChamadoDaEfetividade[],
  ativoId: string,
  agora: Date,
): Corretiva[] {
  return corretivasDosChamados(chamados.filter((c) => c.ativoId === ativoId)).map(
    ({ transicoes, ...c }) => ({
      ...c,
      ...conclusaoEReaberturas(transicoes, agora),
      aceitaEm: aceiteDaOs(transicoes, agora),
    }),
  );
}

/** A efetividade de uma intervenção, sobre o histórico do ativo dela. */
export function efetividadeDaIntervencao(
  i: Intervencao,
  historico: {
    chamados: readonly ChamadoDaEfetividade[];
    paradas: readonly (Parada & { ativoId: string })[];
  },
  config: ConfigEfetividade,
  agora: Date,
): Efetividade {
  return efetividadeAntesDepois(
    {
      intervencaoEm: i.em,
      corretivas: corretivasDoAtivo(historico.chamados, i.ativoId, agora),
      paradas: historico.paradas.filter((p) => p.ativoId === i.ativoId),
      intervencaoId: i.chamadoId,
    },
    agora,
    config,
  );
}
