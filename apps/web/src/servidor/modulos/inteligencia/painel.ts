// A ligação do painel do Intelligence (as telas do 1.0): as portas do
// @hubkeep/inteligencia (painel.ts) sobre o packages/db, com o hk_app e o
// contexto de quem pede. Aqui só a tradução das linhas para o motor; as regras
// (o módulo e o papel, a transição, o responsável, a substituição) são do
// motor, e a RLS da app.insight é a última palavra sobre quem lê e decide.
// O sinal do hóspede (ADR-047) usa as mesmas portas, com as da importação,
// da fila e da classificação; a RLS da app.sinal_hospede é a última palavra.
// Abrir chamado a partir da reclamação (adendo de 19/10/2026 ao ADR-047): o
// motor confere a reclamação e monta o pedido, o chamado abre pelo caso de uso
// `abrir` do núcleo, sem mudança nele, e a ligação vem numa segunda transação.
import {
  type CasosDeUsoDeChamados,
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
import { Conflito, type Contexto, ErroDeDominio } from '@hubkeep/dominio';
import {
  type AberturaDoPainel,
  type PortasDoChamadoDoInsight,
  ligarChamadoDaReclamacao,
  ligarChamadoDoInsight,
  prepararChamadoDaReclamacao,
  prepararChamadoDoInsight,
  type AtivosEncontrados,
  type FilaDoSinal,
  type LigacaoDoSinal,
  type LinhaDoCsv,
  type PortasDaFilaDoSinal,
  type PortasDasReclamacoes,
  type ReclamacoesDoPainel,
  reclamacoesDoAtivo,
  reclamacoesDoInsight,
  type ResultadoDaImportacao,
  type SinalDaFila,
  type SituacaoDaFila,
  acessoAsReclamacoes,
  classificarSinal,
  ehLigacaoDoSinal,
  importarSinais,
  listarSinais,
  type PortasDaBuscaDeAtivos,
  procurarAtivos,
  type EfetividadesDoPainel,
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
  LIMITE_DE_RECALCULOS,
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
  /** O caso de uso do núcleo que abre o chamado, com o contexto de quem pede. */
  chamados: Pick<CasosDeUsoDeChamados, 'abrir'>;
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

export interface PedidoDeChamadoDaReclamacaoDoPainel {
  /** Com o ativo da classificação; sem ele, o chamado abre na UH. */
  comAtivo: boolean;
  descricao: string;
}

export interface PedidoDeChamadoDoInsightDoPainel {
  /** A UH ou a área comum do hotel do insight. */
  localId: string;
  ativoId: string | null;
  descricao: string;
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
  /** As reclamações ligadas ao ativo na janela do score (C2 do ADR-047). */
  reclamacoesDoAtivo(ctx: Contexto, ativoId: string): Promise<ReclamacoesDoPainel>;
  /** As reclamações da evidência do insight sistêmico; null nos outros insights. */
  reclamacoesDoInsight(ctx: Contexto, insightId: string): Promise<ReclamacoesDoPainel | null>;
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
  /** Se usa a tela de reclamações, e se as outras telas já abriram (adendo ao ADR-035). */
  acessoAsReclamacoes(ctx: Contexto): Promise<{ telasAbertas: boolean }>;
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
  /**
   * Abre o chamado a partir da reclamação e liga os dois. Se a ligação falhar
   * depois do chamado aberto: chamado_sem_ligacao, com o id do chamado.
   */
  abrirChamadoDaReclamacao(
    ctx: Contexto,
    sinalId: string,
    pedido: PedidoDeChamadoDaReclamacaoDoPainel,
  ): Promise<{ chamadoId: string }>;
  /** Liga de novo a reclamação ao chamado que quem pede abriu a partir dela. */
  ligarChamadoDaReclamacao(ctx: Contexto, sinalId: string, chamadoId: string): Promise<void>;
  /**
   * Um chamado para as reclamações do insight sistêmico, e as ligações das que
   * ainda não têm chamado. Se a ligação falhar: chamado_sem_ligacao, com o id.
   */
  abrirChamadoDoInsight(
    ctx: Contexto,
    insightId: string,
    pedido: PedidoDeChamadoDoInsightDoPainel,
  ): Promise<{ chamadoId: string; ligadas: number }>;
  /** Liga ao chamado que quem pede abriu as reclamações do insight ainda sem chamado. */
  ligarChamadoDoInsight(
    ctx: Contexto,
    insightId: string,
    chamadoId: string,
  ): Promise<{ chamadoId: string; ligadas: number }>;
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
): PortasDasReclamacoes & PortasDaBuscaDeAtivos & PortasDaFilaDoSinal & PortasDoChamadoDoInsight {
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
    recalculosDoDia: (ativoId, dia) =>
      porta.recalculosDoDia(ctx, ativoId, dia, LIMITE_DE_RECALCULOS),
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
    sinaisPorIds: async (ids, limite) =>
      (await porta.sinaisPorIds(ctx, ids, limite)).map(sinalNoMotor),
    sinaisDoAtivo: async (ativoId, desde, ate, limite) =>
      (await porta.sinaisDoAtivo(ctx, ativoId, desde, ate, limite)).map(sinalNoMotor),
    nomesDasUhs: (ids) => porta.nomesDasUhs(ctx, ids),
    referenciasDaClassificacao: (r) => porta.referenciasDaClassificacao(ctx, r),
    classificar: (c) => porta.classificar(ctx, c),
    reclamacaoParaChamado: (id) => porta.reclamacaoParaChamado(ctx, id),
    ligarChamado: (l) => porta.ligarChamado(ctx, l),
    ligarChamados: (ls) => porta.ligarChamados(ctx, ls),
  };
}

/**
 * A ligação, numa segunda transação, depois do chamado aberto (adendo de
 * 19/10/2026 ao ADR-047): se falhar, o chamado fica aberto, e o erro diz qual.
 */
async function ligarDepoisDeAbrir<T>(chamadoId: string, ligar: () => Promise<T>): Promise<T> {
  try {
    return await ligar();
  } catch (e) {
    throw new Conflito('chamado_sem_ligacao', 'O chamado abriu, mas a ligação falhou.', {
      chamadoId,
      ...(e instanceof ErroDeDominio ? { causa: e.codigo } : {}),
    });
  }
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
    reclamacoesDoAtivo: (ctx, ativoId) =>
      reclamacoesDoAtivo(portasDoPainel(deps, ctx), ativoId, agora()),
    reclamacoesDoInsight: (ctx, insightId) =>
      reclamacoesDoInsight(portasDoPainel(deps, ctx), insightId, agora()),
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
    acessoAsReclamacoes: (ctx) => acessoAsReclamacoes(portasDoPainel(deps, ctx), agora()),
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
    abrirChamadoDaReclamacao: async (ctx, sinalId, pedido) => {
      const portas = portasDoPainel(deps, ctx);
      const abertura = await prepararChamadoDaReclamacao(portas, { ...pedido, sinalId }, agora());
      const { id } = await deps.chamados.abrir(ctx, abertura);
      await ligarDepoisDeAbrir(id, () =>
        ligarChamadoDaReclamacao(
          portas,
          { sinalId, chamadoId: id, usuarioId: ctx.usuarioId },
          agora(),
        ),
      );
      return { chamadoId: id };
    },
    ligarChamadoDaReclamacao: (ctx, sinalId, chamadoId) =>
      ligarChamadoDaReclamacao(
        portasDoPainel(deps, ctx),
        { sinalId, chamadoId, usuarioId: ctx.usuarioId },
        agora(),
      ),
    abrirChamadoDoInsight: async (ctx, insightId, pedido) => {
      const portas = portasDoPainel(deps, ctx);
      const abertura = await prepararChamadoDoInsight(portas, { ...pedido, insightId }, agora());
      const { id } = await deps.chamados.abrir(ctx, abertura);
      return {
        chamadoId: id,
        ligadas: await ligarDepoisDeAbrir(id, () =>
          ligarChamadoDoInsight(
            portas,
            { insightId, chamadoId: id, usuarioId: ctx.usuarioId },
            agora(),
          ),
        ),
      };
    },
    ligarChamadoDoInsight: async (ctx, insightId, chamadoId) => ({
      chamadoId,
      ligadas: await ligarChamadoDoInsight(
        portasDoPainel(deps, ctx),
        { insightId, chamadoId, usuarioId: ctx.usuarioId },
        agora(),
      ),
    }),
  };
}
