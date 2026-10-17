// A ligação do painel do Intelligence (as telas do 1.0): as portas do
// @hubkeep/inteligencia (painel.ts) sobre o packages/db, com o hk_app e o
// contexto de quem pede. Aqui só a tradução das linhas para o motor; as regras
// (o módulo e o papel, a transição, o responsável, a substituição) são do
// motor, e a RLS da app.insight é a última palavra sobre quem lê e decide.
// O sinal do hóspede (ADR-047) usa as mesmas portas, com as da importação,
// da fila e da classificação; a RLS da app.sinal_hospede é a última palavra.
import {
  type PortaAtribuicoes,
  type PortaConfiguracao,
  type PortaModulos,
  type Relogio,
  termoDeBusca,
} from '@hubkeep/aplicacao';
import type {
  InsightDoPainelNoBanco,
  PortaDoPainelDoIntelligence,
  SinalDaFilaNoBanco,
} from '@hubkeep/db';
import type { Contexto } from '@hubkeep/dominio';
import {
  type AberturaDoPainel,
  type AtivosEncontrados,
  type FilaDoSinal,
  type LigacaoDoSinal,
  type LinhaDoCsv,
  type PortasDaFilaDoSinal,
  type ResultadoDaImportacao,
  type SinalDaFila,
  type SituacaoDaFila,
  classificarSinal,
  ehLigacaoDoSinal,
  importarSinais,
  listarSinais,
  type PortasDaBuscaDeAtivos,
  procurarAtivos,
  type EfetividadesDoPainel,
  type PortasDaSubstituicao,
  type SubstituicaoDoAtivo,
  efetividadeDoAtivo,
  substituicaoDoAtivo,
  efetividadeDoInsight,
  listarEfetividades,
  FUSO_PADRAO_DO_GRUPO,
  type AcaoDoInsight,
  type FiltroDeEstadoDoInsight,
  type InsightDoPainel,
  LIMITE_DA_LISTA,
  type ListaDeInsights,
  type PaginaDoAtivo,
  type PaginaDoInsight,
  type ResumoDoPainel,
  type TipoDeInsight,
  aberturaDoPainel,
  decidirInsight,
  ehEstadoDoInsight,
  ehMotivoDeDescarte,
  ehTipoDeInsight,
  listarInsights,
  resumoDoPainel,
  verAtivo,
  verInsight,
} from '@hubkeep/inteligencia';

export interface DepsDoPainel {
  porta: PortaDoPainelDoIntelligence;
  modulos: PortaModulos;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  /** As políticas gravadas no grupo, para inteligencia.visibilidade_telas. */
  configuracao: Pick<PortaConfiguracao, 'politicas'>;
  relogio: Relogio;
}

const CHAVE_DA_VISIBILIDADE = 'inteligencia.visibilidade_telas';

export interface PedidoDeListaDoPainel {
  estado?: FiltroDeEstadoDoInsight | undefined;
  tipo?: TipoDeInsight | undefined;
  faixa?: string | undefined;
  hotelId?: string | undefined;
}

export interface PedidoDeDecisaoDoPainel {
  acao: AcaoDoInsight;
  versao: number;
  nota?: string | null | undefined;
  motivoDeDescarte?: string | null | undefined;
}

export interface PedidoDeClassificacaoDoPainel {
  versao: number;
  manutencao: boolean;
  categoriaId: string | null;
  uhId: string | null;
  ativoId: string | null;
  ligacao: LigacaoDoSinal;
}

export interface CasosDeUsoDoPainel {
  abertura(ctx: Contexto): Promise<AberturaDoPainel>;
  resumo(ctx: Contexto): Promise<ResumoDoPainel>;
  listar(ctx: Contexto, pedido: PedidoDeListaDoPainel): Promise<ListaDeInsights>;
  ver(ctx: Contexto, insightId: string): Promise<PaginaDoInsight>;
  ativo(ctx: Contexto, ativoId: string): Promise<PaginaDoAtivo>;
  /** "Procurar ativo" (16/10/2026): o termo cru da query; abaixo de 3 letras, busca_curta. */
  procurarAtivos(ctx: Contexto, busca: string | null): Promise<AtivosEncontrados>;
  /** As intervenções do ativo, com o antes e depois (adendo ao ADR-033, 15/10/2026). */
  efetividadeDoAtivo(ctx: Contexto, ativoId: string): Promise<EfetividadesDoPainel>;
  /** O sinal de substituição do ativo, calculado agora (proposta de 16/10/2026); null no ativo baixado. */
  substituicaoDoAtivo(ctx: Contexto, ativoId: string): Promise<SubstituicaoDoAtivo | null>;
  /** A seção abaixo da lista de insights: as intervenções dos hotéis em que a pessoa decide. */
  efetividades(ctx: Contexto): Promise<EfetividadesDoPainel>;
  /** Na página do insight: as intervenções nos ativos dele, depois da primeira detecção. */
  efetividadeDoInsight(ctx: Contexto, insightId: string): Promise<EfetividadesDoPainel>;
  decidir(
    ctx: Contexto,
    insightId: string,
    pedido: PedidoDeDecisaoDoPainel,
  ): Promise<Awaited<ReturnType<typeof decidirInsight>>>;
  /** O sinal do hóspede (ADR-047): as linhas do CSV num hotel, com o resultado por linha. */
  importarSinais(
    ctx: Contexto,
    hotelId: string,
    linhas: readonly LinhaDoCsv[],
  ): Promise<ResultadoDaImportacao>;
  /** A fila de classificação do hotel no recorte (as sem classificação, sem ele). */
  filaDeSinais(
    ctx: Contexto,
    hotelId: string,
    situacao: SituacaoDaFila | undefined,
  ): Promise<FilaDoSinal>;
  classificarSinal(
    ctx: Contexto,
    sinalId: string,
    pedido: PedidoDeClassificacaoDoPainel,
  ): Promise<{ versao: number }>;
}

/** A linha do banco na forma do motor; valor fora das listas é defeito, não dado. */
function noMotor<T extends InsightDoPainelNoBanco>(
  i: T,
): Omit<T, 'tipo' | 'estado' | 'motivoDeDescarte'> & InsightDoPainel {
  if (!ehTipoDeInsight(i.tipo)) throw new Error(`Tipo de insight desconhecido: ${i.tipo}`);
  if (!ehEstadoDoInsight(i.estado)) throw new Error(`Estado de insight desconhecido: ${i.estado}`);
  const motivo = i.motivoDeDescarte;
  if (motivo !== null && !ehMotivoDeDescarte(motivo)) {
    throw new Error(`Motivo de descarte desconhecido: ${motivo}`);
  }
  return { ...i, tipo: i.tipo, estado: i.estado, motivoDeDescarte: motivo };
}

/** A reclamação do banco na forma do motor; ligação fora da lista é defeito, não dado. */
function sinalNoMotor(s: SinalDaFilaNoBanco): SinalDaFila {
  if (!ehLigacaoDoSinal(s.ligacao)) throw new Error(`Ligação do sinal desconhecida: ${s.ligacao}`);
  return { ...s, ligacao: s.ligacao };
}

export function portasDoPainel(
  deps: DepsDoPainel,
  ctx: Contexto,
): PortasDaSubstituicao & PortasDaBuscaDeAtivos & PortasDaFilaDoSinal {
  const { porta } = deps;
  return {
    modulos: () => deps.modulos.contratados(ctx),
    atribuicoes: () => deps.atribuicoes.doUsuario(ctx),
    // Só o nível do grupo vale (adendo ao ADR-035 de 12/10/2026).
    visibilidade: async () =>
      (await deps.configuracao.politicas(ctx)).find(
        (p) => p.chave === CHAVE_DA_VISIBILIDADE && p.escopo.tipo === 'grupo',
      )?.valor,
    // O grupo ainda não tem fuso gravado (pedido ao núcleo): Brasília.
    fuso: async () => FUSO_PADRAO_DO_GRUPO,
    contagens: async (estados) =>
      (await porta.contagens(ctx, estados)).map((c) => {
        if (!ehTipoDeInsight(c.tipo)) throw new Error(`Tipo de insight desconhecido: ${c.tipo}`);
        return { ...c, tipo: c.tipo };
      }),
    insights: async (filtro) => (await porta.insights(ctx, filtro, LIMITE_DA_LISTA)).map(noMotor),
    insight: async (id) => {
      const i = await porta.insight(ctx, id);
      return i && noMotor(i);
    },
    ligados: (ids) => porta.ligados(ctx, ids),
    chamados: (ids) => porta.chamados(ctx, ids),
    nomes: (p) => porta.nomes(ctx, p),
    decidir: (d) => porta.decidir(ctx, d),
    ativo: (id) => porta.ativo(ctx, id),
    ativosPorBusca: (termo, limite) => porta.ativosPorBusca(ctx, termo, limite),
    metricasDoAtivo: (ativoId, desde) => porta.metricasDoAtivo(ctx, ativoId, desde),
    insightsDoEscopo: async (tipo, chave, valor) =>
      (await porta.insightsDoEscopo(ctx, tipo, chave, valor, LIMITE_DA_LISTA)).map(noMotor),
    politicasDaEfetividade: () => porta.politicasDaEfetividade(ctx),
    politicasDaSubstituicao: () => porta.politicasDaSubstituicao(ctx),
    politicasDoImpacto: () => porta.politicasDoImpacto(ctx),
    sinaisDoHotelNaJanela: (hotelId, desde, ate) =>
      porta.sinaisDoHotelNaJanela(ctx, hotelId, desde, ate),
    intervencoes: (filtro) => porta.intervencoes(ctx, filtro),
    historicoDosAtivos: (ativoIds, desde, ate) =>
      porta.historicoDosAtivos(ctx, ativoIds, desde, ate),
    hotelDoSinal: (id) => porta.hotelDoSinal(ctx, id),
    gravarSinais: (i) => porta.gravarSinais(ctx, i),
    sinaisDoHotel: async (hotelId, situacao, limite) =>
      (await porta.sinaisDoHotel(ctx, hotelId, situacao, limite)).map(sinalNoMotor),
    sinalParaClassificar: (id) => porta.sinalParaClassificar(ctx, id),
    referenciasDaClassificacao: (r) => porta.referenciasDaClassificacao(ctx, r),
    classificar: (c) => porta.classificar(ctx, c),
  };
}

export function criarPainel(deps: DepsDoPainel): CasosDeUsoDoPainel {
  const agora = () => deps.relogio.agora();
  return {
    abertura: (ctx) => aberturaDoPainel(portasDoPainel(deps, ctx), agora()),
    resumo: (ctx) => resumoDoPainel(portasDoPainel(deps, ctx), agora()),
    listar: (ctx, pedido) => listarInsights(portasDoPainel(deps, ctx), pedido, agora()),
    ver: (ctx, insightId) => verInsight(portasDoPainel(deps, ctx), insightId, agora()),
    ativo: (ctx, ativoId) => verAtivo(portasDoPainel(deps, ctx), ativoId, agora()),
    procurarAtivos: async (ctx, busca) =>
      procurarAtivos(portasDoPainel(deps, ctx), termoDeBusca(busca), agora()),
    efetividadeDoAtivo: (ctx, ativoId) =>
      efetividadeDoAtivo(portasDoPainel(deps, ctx), ativoId, agora()),
    substituicaoDoAtivo: (ctx, ativoId) =>
      substituicaoDoAtivo(portasDoPainel(deps, ctx), ativoId, agora()),
    efetividades: (ctx) => listarEfetividades(portasDoPainel(deps, ctx), agora()),
    efetividadeDoInsight: (ctx, insightId) =>
      efetividadeDoInsight(portasDoPainel(deps, ctx), insightId, agora()),
    decidir: (ctx, insightId, pedido) =>
      decidirInsight(
        portasDoPainel(deps, ctx),
        { ...pedido, insightId, usuarioId: ctx.usuarioId },
        agora(),
      ),
    importarSinais: (ctx, hotelId, linhas) =>
      importarSinais(
        portasDoPainel(deps, ctx),
        { hotelId, usuarioId: ctx.usuarioId, linhas },
        agora(),
      ),
    filaDeSinais: (ctx, hotelId, situacao) =>
      listarSinais(
        portasDoPainel(deps, ctx),
        { hotelId, situacao: situacao ?? 'pendentes' },
        agora(),
      ),
    classificarSinal: (ctx, sinalId, pedido) =>
      classificarSinal(
        portasDoPainel(deps, ctx),
        { ...pedido, sinalId, usuarioId: ctx.usuarioId },
        agora(),
      ),
  };
}
