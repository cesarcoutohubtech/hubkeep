// A efetividade no painel do Intelligence (adendo ao ADR-033 de 15/10/2026):
// a leitura das intervenções e o antes e depois de cada uma, sob demanda, sem
// gravar resultado. As telas (PR seguinte) mostram nos três lugares decididos
// em 10/10/2026; aqui ficam dois deles:
// - o detalhe do ativo: as intervenções do ativo;
// - a seção abaixo da lista de insights: as intervenções do escopo de quem lê.
// A página do insight espera a data da decisão (pendência registrada no
// diário do Intelligence, 15/10/2026).
//
// - Quem vê: quem decide o insight do hotel do ativo, como no detalhe do
//   ativo (Cesar, 10/10/2026). Na lista, a intervenção de hotel em que a
//   pessoa não decide fica fora; no ativo, ativo_nao_encontrado.
// - Quais: as concluídas nos últimos 180 dias (`DIAS_DAS_INTERVENCOES`), a
//   janela de leitura, da mais recente para a mais antiga, até
//   `LIMITE_DAS_INTERVENCOES`.
// - O histórico de cada ativo vem numa leitura só, do início da janela antes
//   da primeira intervenção ao fim da janela depois da última.
import type { Parada } from '@hubkeep/dominio';
import { type Efetividade, codigosDeIntervencao } from './efetividade';
import type { LinhaDePolitica } from './fonte';
import { podeDecidirInsight } from './insight';
import {
  type ChamadoDaEfetividade,
  type Intervencao,
  codigosDoTenant,
  efetividadeDaIntervencao,
  efetividadeDoHotel,
  intervencoesDosChamados,
} from './intervencao';
import {
  type NomesDoPainel,
  type PortasDoPainel,
  ativoNaoEncontrado,
  exigirPainel,
  unicos,
} from './painel';
import { DIA_MS } from './score';

/** As intervenções concluídas nestes últimos dias entram (a janela de leitura). */
export const DIAS_DAS_INTERVENCOES = 180;

/** O máximo de intervenções da seção da lista. */
export const LIMITE_DAS_INTERVENCOES = 100;

export interface ParadaDoAtivo extends Parada {
  ativoId: string;
}

/** O que a efetividade lê, além das portas do painel, no contexto de quem pede. */
export interface PortasDaEfetividade extends PortasDoPainel {
  /** As linhas ativas de `inteligencia.efetividade`, nos três níveis. */
  politicasDaEfetividade(): Promise<readonly LinhaDePolitica[]>;
  /**
   * Os chamados com ativo cuja OS tem um destes códigos de solução (pela chave
   * padrão ou pelo id) e uma conclusão depois de `desde`; com `ativoId`, só os
   * desse ativo. A regra (a OS que vale, a conclusão final) é do motor.
   */
  intervencoes(filtro: {
    codigos: readonly string[];
    desde: Date;
    ativoId?: string;
  }): Promise<readonly ChamadoDaEfetividade[]>;
  /**
   * Os chamados dos ativos abertos até `ate` e abertos depois de `desde` ou
   * com transição de OS nesse trecho, e as paradas dos ativos que tocam o trecho.
   */
  historicoDosAtivos(
    ativoIds: readonly string[],
    desde: Date,
    ate: Date,
  ): Promise<{ chamados: readonly ChamadoDaEfetividade[]; paradas: readonly ParadaDoAtivo[] }>;
}

export interface EfetividadeDaIntervencao {
  intervencao: Intervencao;
  efetividade: Efetividade;
}

export interface EfetividadesDoPainel {
  intervencoes: EfetividadeDaIntervencao[];
  nomes: NomesDoPainel;
}

const configDe =
  (linhas: readonly LinhaDePolitica[]) => (h: Pick<Intervencao, 'hotelId' | 'bandeiraId'>) =>
    efetividadeDoHotel(linhas, { id: h.hotelId, bandeiraId: h.bandeiraId });

/** O antes e depois das intervenções que passam no filtro, com uma leitura do histórico. */
async function calcular(
  p: PortasDaEfetividade,
  chamados: readonly ChamadoDaEfetividade[],
  linhas: readonly LinhaDePolitica[],
  agora: Date,
  vale: (i: Intervencao) => boolean = () => true,
): Promise<EfetividadeDaIntervencao[]> {
  const config = configDe(linhas);
  const desde = new Date(agora.getTime() - DIAS_DAS_INTERVENCOES * DIA_MS);
  const intervencoes = intervencoesDosChamados(chamados, config, desde, agora)
    .filter(vale)
    .slice(0, LIMITE_DAS_INTERVENCOES);
  if (!intervencoes.length) return [];
  const janela = Math.max(...intervencoes.map((i) => config(i).janelaDias)) * DIA_MS;
  const datas = intervencoes.map((i) => i.em.getTime());
  const historico = await p.historicoDosAtivos(
    unicos(intervencoes.map((i) => i.ativoId)),
    new Date(Math.min(...datas) - janela),
    new Date(Math.min(agora.getTime(), Math.max(...datas) + janela)),
  );
  return intervencoes.map((i) => ({
    intervencao: i,
    efetividade: efetividadeDaIntervencao(i, historico, config(i), agora),
  }));
}

/**
 * As intervenções do ativo, com o antes e depois. Quem não decide o insight
 * do hotel do ativo recebe ativo_nao_encontrado, como no detalhe do ativo.
 */
export async function efetividadeDoAtivo(
  p: PortasDaEfetividade,
  ativoId: string,
  agora: Date,
): Promise<EfetividadeDaIntervencao[]> {
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
  const linhas = await p.politicasDaEfetividade();
  const codigos = codigosDeIntervencao(
    efetividadeDoHotel(linhas, { id: ativo.hotelId, bandeiraId: ativo.bandeiraId }),
  );
  if (!codigos.length) return [];
  const desde = new Date(agora.getTime() - DIAS_DAS_INTERVENCOES * DIA_MS);
  const chamados = await p.intervencoes({ codigos, desde, ativoId: ativo.id });
  return calcular(p, chamados, linhas, agora);
}

/** A seção abaixo da lista de insights: as intervenções dos hotéis em que a pessoa decide. */
export async function listarEfetividades(
  p: PortasDaEfetividade,
  agora: Date,
): Promise<EfetividadesDoPainel> {
  const atribuicoes = await exigirPainel(p, agora);
  const linhas = await p.politicasDaEfetividade();
  const desde = new Date(agora.getTime() - DIAS_DAS_INTERVENCOES * DIA_MS);
  const chamados = await p.intervencoes({ codigos: codigosDoTenant(linhas), desde });
  const intervencoes = await calcular(p, chamados, linhas, agora, (i) =>
    podeDecidirInsight(
      atribuicoes,
      { tipo: 'hotel', hotelId: i.hotelId, bandeiraId: i.bandeiraId },
      agora,
    ),
  );
  const nomes = await p.nomes({
    hotelIds: unicos(intervencoes.map((e) => e.intervencao.hotelId)),
    bandeiraIds: [],
    usuarioIds: [],
    ativoIds: unicos(intervencoes.map((e) => e.intervencao.ativoId)),
  });
  return { intervencoes, nomes };
}
