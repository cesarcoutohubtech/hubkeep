// O sinal de substituição no detalhe do ativo (proposta de 16/10/2026,
// aprovada por Cesar e Kaio no mesmo dia; a regra 1 do cálculo do dia, #101:
// "a substituição fica na tela do ativo"):
// - no 1.0, só o sinal: não registra decisão, não afirma retorno e não usa o
//   valor de reposição, que ficam na 2.0. O critério do custo sobre a
//   reposição fica sem dado;
// - calculado na leitura, sem gravar, como a efetividade; a tela diz quando e
//   com que versão da regra;
// - quem vê: quem vê o detalhe do ativo (quem decide o insight do hotel dele);
//   não abre insight, não entra na lista e não notifica;
// - o ativo baixado não tem sinal.
//
// As fontes de cada critério, em 12 meses até `agora`: as corretivas do ativo
// (sem o chamado cancelado), o tempo parado, a idade pela data de compra, o
// impacto no hóspede como na atenção versão 7 (o Guest Impact Score na janela
// da política do hotel, se o hotel tem reclamação importada nela; senão, a
// porcentagem dos chamados de 12 meses que afetaram hóspede; versão 2,
// ADR-047), a criticidade do cadastro, a reincidência do último dia gravado e
// a garantia no dia do fuso do hotel.
import { diaNoFuso } from '@hubkeep/dominio';
import { type LinhaDePolitica, niveisDoHotel } from './fonte';
import { ehCriticidade, horasParadasNoTrecho, impactoHospedeDosChamados } from './historico';
import {
  type ConfigImpactoHospede,
  PADRAO_IMPACTO_HOSPEDE,
  type SinalDaFonte,
  impactoNoHospede,
  ultimoReparo,
} from './impacto-hospede';
import { podeDecidirInsight } from './insight';
import { corretivasDoAtivo } from './intervencao';
import {
  type AtivoDoPainel,
  DIAS_DA_SERIE_DO_ATIVO,
  ativoNaoEncontrado,
  exigirPainel,
} from './painel';
import type { PortasDaEfetividade } from './painel-efetividade';
import { valorValidoDoIntelligence } from './politicas';
import { DIA_MS } from './score';
import {
  type ConfigSubstituicao,
  PADRAO_SUBSTITUICAO,
  type Substituicao,
  sinalDeSubstituicao,
} from './substituicao';

/** Os critérios olham os últimos tantos dias (os 12 meses do PRD). */
export const DIAS_DA_SUBSTITUICAO = 365;

const CHAVE_DA_SUBSTITUICAO = 'inteligencia.substituicao';
const CHAVE_DO_IMPACTO = 'inteligencia.impacto_hospede';

/** O que a substituição lê, além das portas da efetividade, no contexto de quem pede. */
export interface PortasDaSubstituicao extends PortasDaEfetividade {
  /** As linhas ativas de `inteligencia.substituicao`, nos três níveis. */
  politicasDaSubstituicao(): Promise<readonly LinhaDePolitica[]>;
  /** As linhas ativas de `inteligencia.impacto_hospede`, nos três níveis (ADR-047). */
  politicasDoImpacto(): Promise<readonly LinhaDePolitica[]>;
  /** As reclamações do hotel avaliadas depois de `desde` e até `ate`, sem o texto (ADR-047). */
  sinaisDoHotelNaJanela(hotelId: string, desde: Date, ate: Date): Promise<readonly SinalDaFonte[]>;
}

export interface SubstituicaoDoAtivo {
  substituicao: Substituicao;
  /** Quantos critérios tinham dado para avaliar. */
  avaliados: number;
  calculadoEm: Date;
}

/** A política do hotel: a primeira linha válida, do hotel ao grupo, ou o padrão. */
export function substituicaoDoHotel(
  linhas: readonly LinhaDePolitica[],
  hotel: { id: string; bandeiraId: string | null },
): ConfigSubstituicao {
  const valida = niveisDoHotel(linhas, CHAVE_DA_SUBSTITUICAO, hotel).find((l) =>
    valorValidoDoIntelligence(CHAVE_DA_SUBSTITUICAO, l.valor),
  );
  return (valida?.valor as ConfigSubstituicao | undefined) ?? PADRAO_SUBSTITUICAO;
}

/** O Guest Impact Score do hotel: a primeira linha válida, do hotel ao grupo, ou o padrão. */
export function impactoDoHotel(
  linhas: readonly LinhaDePolitica[],
  hotel: { id: string; bandeiraId: string | null },
): ConfigImpactoHospede {
  const valida = niveisDoHotel(linhas, CHAVE_DO_IMPACTO, hotel).find((l) =>
    valorValidoDoIntelligence(CHAVE_DO_IMPACTO, l.valor),
  );
  return (valida?.valor as ConfigImpactoHospede | undefined) ?? PADRAO_IMPACTO_HOSPEDE;
}

/** Anos completos entre duas datas AAAA-MM-DD; null sem a data de início ou com ela no futuro. */
export function anosCompletos(desde: string | null, ate: string): number | null {
  if (!desde) return null;
  const [a1, m1, d1] = desde.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = ate.split('-').map(Number) as [number, number, number];
  const anos = a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
  return anos < 0 ? null : anos;
}

/**
 * O sinal de substituição do ativo, calculado agora. Quem não decide o
 * insight do hotel do ativo recebe ativo_nao_encontrado, como no detalhe do
 * ativo; o ativo baixado devolve null.
 */
export async function substituicaoDoAtivo(
  p: PortasDaSubstituicao,
  ativoId: string,
  agora: Date,
): Promise<SubstituicaoDoAtivo | null> {
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
  if (ativo.desativadoEm && ativo.desativadoEm.getTime() <= agora.getTime()) return null;

  const desde = new Date(agora.getTime() - DIAS_DA_SUBSTITUICAO * DIA_MS);
  const diaDaSerie = new Date(agora.getTime() - (DIAS_DA_SERIE_DO_ATIVO - 1) * DIA_MS)
    .toISOString()
    .slice(0, 10);
  const hotel = { id: ativo.hotelId, bandeiraId: ativo.bandeiraId };
  const [linhas, historico, metricas, doImpacto] = await Promise.all([
    p.politicasDaSubstituicao(),
    p.historicoDosAtivos([ativo.id], desde, agora),
    p.metricasDoAtivo(ativo.id, diaDaSerie),
    p.politicasDoImpacto(),
  ]);
  const impacto = impactoDoHotel(doImpacto, hotel);
  const sinais = await p.sinaisDoHotelNaJanela(
    ativo.hotelId,
    new Date(agora.getTime() - impacto.janelaDias * DIA_MS),
    agora,
  );
  const substituicao = sinalDeSubstituicao(
    entradaDoAtivo(ativo, historico, metricas.at(-1)?.reincidencia ?? null, agora, {
      config: impacto,
      sinais,
    }),
    substituicaoDoHotel(linhas, { id: ativo.hotelId, bandeiraId: ativo.bandeiraId }),
  );
  return {
    substituicao,
    avaliados: substituicao.criterios.filter((c) => c.atingido !== null).length,
    calculadoEm: agora,
  };
}

function entradaDoAtivo(
  ativo: AtivoDoPainel,
  historico: Awaited<ReturnType<PortasDaEfetividade['historicoDosAtivos']>>,
  reincidencia: number | null,
  agora: Date,
  hospede: { config: ConfigImpactoHospede; sinais: readonly SinalDaFonte[] },
): Parameters<typeof sinalDeSubstituicao>[0] {
  const inicio = agora.getTime() - DIAS_DA_SUBSTITUICAO * DIA_MS;
  const corretivas = corretivasDoAtivo(historico.chamados, ativo.id, agora).filter(
    (c) => c.abertaEm.getTime() > inicio && c.abertaEm.getTime() <= agora.getTime(),
  );
  const hoje = diaNoFuso(agora, ativo.fuso);
  return {
    corretivas12m: corretivas.length,
    horasParadas12m: horasParadasNoTrecho(
      historico.paradas.filter((x) => x.ativoId === ativo.id),
      inicio,
      agora.getTime(),
      agora,
    ),
    idadeAnos: anosCompletos(ativo.dataCompra, hoje),
    // O valor de reposição é da 2.0: sem ele, o critério do custo fica sem dado.
    custo12m: null,
    custoReposicao: null,
    impactoHospede: impactoNoHospede(
      {
        // Os sinais já vêm da janela da política, só do hotel do ativo.
        hotelComReclamacao: hospede.sinais.length > 0,
        reclamacoes: hospede.sinais.filter((x) => x.ativoId === ativo.id),
        ultimoReparoEm: ultimoReparo(corretivas, agora),
        percentualDosChamados: impactoHospedeDosChamados(corretivas, agora, DIAS_DA_SUBSTITUICAO),
      },
      agora,
      hospede.config,
    ).valor,
    criticidade: ehCriticidade(ativo.criticidade) ? ativo.criticidade : null,
    reincidencia,
    garantiaVigente: ativo.garantiaAte === null ? null : hoje <= ativo.garantiaAte,
  };
}
