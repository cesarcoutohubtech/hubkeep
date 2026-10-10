// Leituras do detalhe do chamado (C7), num lugar só para a API e a página
// (P1c). A rota GET /api/v1/chamados/{id} e a de linha do tempo montam a
// resposta por aqui; a página do detalhe, no servidor, também. Os casos de uso
// e o contexto são os mesmos, então a autorização é a mesma: quem não vê o
// chamado recebe NaoEncontrado (404 chamado_nao_encontrado) nos dois caminhos.
import type {
  CasosDeUsoDeChamados,
  CasosDeUsoDeConsultas,
  CasosDeUsoDeEquipes,
  CasosDeUsoDePapeis,
  CasosDeUsoDeSituacoes,
  CasosDeUsoDeTriagem,
} from '@hubkeep/aplicacao';
import {
  ESTADOS_DA_OS_API,
  ESTADOS_DO_CHAMADO_API,
  ORIGENS_DO_CHAMADO_API,
  RespostaDeChamado,
  RespostaDeEquipes,
  RespostaDeHoteis,
  RespostaDeLinhaDoTempo,
  RespostaDeSituacoesEPrioridades,
  type z,
} from '@hubkeep/contratos';
import type { Contexto } from '@hubkeep/db';
import {
  casosDeUsoDeChamados,
  casosDeUsoDeConsultas,
  casosDeUsoDeEquipes,
  casosDeUsoDePapeis,
  casosDeUsoDeSituacoes,
  casosDeUsoDeTriagem,
} from './composicao';

/** De onde vêm os casos de uso; nos testes, falsos. */
export interface FontesDoChamado {
  chamados: () => Promise<Pick<CasosDeUsoDeChamados, 'chamado'>>;
  triagem: () => Promise<Pick<CasosDeUsoDeTriagem, 'osDoChamado'>>;
  consultas: () => Promise<Pick<CasosDeUsoDeConsultas, 'nomesDoChamado' | 'linhaDoTempo'>>;
  papeis: () => Promise<Pick<CasosDeUsoDePapeis, 'listarHoteisVisiveis'>>;
  situacoes: () => Promise<Pick<CasosDeUsoDeSituacoes, 'listarSituacoesEPrioridades'>>;
  equipes: () => Promise<Pick<CasosDeUsoDeEquipes, 'listarEquipes'>>;
}

const FONTES: FontesDoChamado = {
  chamados: casosDeUsoDeChamados,
  triagem: casosDeUsoDeTriagem,
  consultas: casosDeUsoDeConsultas,
  papeis: casosDeUsoDePapeis,
  situacoes: casosDeUsoDeSituacoes,
  equipes: casosDeUsoDeEquipes,
};

/** O chamado, as OS dele e os nomes (o corpo do GET /api/v1/chamados/{id}). */
export async function detalheDoChamado(
  ctx: Contexto,
  id: string,
  f: FontesDoChamado = FONTES,
): Promise<z.input<typeof RespostaDeChamado>> {
  const c = await (await f.chamados()).chamado(ctx, id);
  const [os, nomes] = await Promise.all([
    (await f.triagem()).osDoChamado(ctx, id),
    (await f.consultas()).nomesDoChamado(ctx, id),
  ]);
  return {
    chamado: {
      id: c.id,
      hotelId: c.hotelId,
      localId: c.localId,
      ativoId: c.ativoId,
      descricao: c.descricao,
      estado: c.estado as (typeof ESTADOS_DO_CHAMADO_API)[number],
      situacaoId: c.situacaoId,
      prioridadeId: c.prioridadeId,
      politicaAplicada: (c.politicaAplicada ?? {}) as Record<string, unknown>,
      abertoPor: c.abertoPor,
      motivoCancelamento: c.motivoCancelamento,
      origem: c.origem as (typeof ORIGENS_DO_CHAMADO_API)[number],
      impactoHospede: c.impactoHospede,
      versao: c.versao,
      criadoEm: c.criadoEm.toISOString(),
    },
    os: os.map((o) => ({
      id: o.id,
      hotelId: o.hotelId,
      chamadoId: o.chamadoId,
      estado: o.estado as (typeof ESTADOS_DA_OS_API)[number],
      situacaoId: o.situacaoId,
      responsavel: o.responsavel,
      motivoCancelamento: o.motivoCancelamento,
      motivoReabertura: o.motivoReabertura,
      executadoPor: o.executadoPor,
      fornecedorId: o.fornecedorId,
      custoInformado: o.custoInformado,
      codigos: o.codigos,
      criadoPor: o.criadoPor,
      versao: o.versao,
      criadoEm: o.criadoEm.toISOString(),
    })),
    nomes,
  };
}

/** A linha do tempo do chamado (o corpo do GET .../linha-do-tempo). */
export async function linhaDoTempoDoChamado(
  ctx: Contexto,
  id: string,
  f: FontesDoChamado = FONTES,
): Promise<z.input<typeof RespostaDeLinhaDoTempo>> {
  const eventos = await (await f.consultas()).linhaDoTempo(ctx, id);
  return { eventos: eventos.map((e) => ({ ...e, em: e.em.toISOString() })) };
}

/** Tudo o que a tela do detalhe mostra ao abrir, no formato que a API entrega. */
export interface TelaDoChamado {
  detalhe: z.output<typeof RespostaDeChamado>;
  /** Vazia quando a leitura falha, como na tela com a API. */
  eventos: z.output<typeof RespostaDeLinhaDoTempo>['eventos'];
  hoteis: z.output<typeof RespostaDeHoteis>['hoteis'];
  /** Nulo quando a leitura falha; a tela usa o padrão vazio. */
  corretiva: z.output<typeof RespostaDeSituacoesEPrioridades> | null;
  /** Nulo quando quem vê não lista as equipes do hotel. */
  candidatos: z.output<typeof RespostaDeEquipes> | null;
}

/**
 * Monta a tela do detalhe no servidor. O chamado é obrigatório: se quem pede
 * não o vê, o NaoEncontrado sobe. O resto é complemento e, como na tela que
 * chamava a API, falha vira vazio; `aoFalhar` recebe o erro para o log.
 * Cada leitura passa pelo contrato da rota correspondente, então a tela
 * recebe exatamente o que receberia da API.
 */
export async function telaDoChamado(
  ctx: Contexto,
  id: string,
  aoFalhar: (erro: unknown) => void,
  f: FontesDoChamado = FONTES,
): Promise<TelaDoChamado> {
  const detalhe = RespostaDeChamado.parse(await detalheDoChamado(ctx, id, f));
  const opcional = async <T>(leitura: () => Promise<T>, padrao: T): Promise<T> => {
    try {
      return await leitura();
    } catch (e) {
      aoFalhar(e);
      return padrao;
    }
  };
  const [eventos, hoteis, corretiva, candidatos] = await Promise.all([
    opcional(
      async () => RespostaDeLinhaDoTempo.parse(await linhaDoTempoDoChamado(ctx, id, f)).eventos,
      [],
    ),
    opcional(
      async () =>
        RespostaDeHoteis.parse({ hoteis: await (await f.papeis()).listarHoteisVisiveis(ctx) })
          .hoteis,
      [],
    ),
    opcional(
      async () =>
        RespostaDeSituacoesEPrioridades.parse(
          await (await f.situacoes()).listarSituacoesEPrioridades(ctx),
        ),
      null,
    ),
    opcional(
      async () =>
        RespostaDeEquipes.parse(
          await (await f.equipes()).listarEquipes(ctx, detalhe.chamado.hotelId),
        ),
      null,
    ),
  ]);
  return { detalhe, eventos, hoteis, corretiva, candidatos };
}
