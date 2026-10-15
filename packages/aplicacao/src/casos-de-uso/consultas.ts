// Consultas da corretiva pelo web (fase 1a, C7): as listas de chamados e OS
// com os filtros básicos (hotel, situação, prioridade, período), os nomes do
// detalhe do chamado e a linha do tempo dele. Ler é escopo: a RLS mostra a
// cada papel só o que ele lê, e aqui não há regra de papel. O domínio valida
// o período e dá o tamanho da página.
import {
  type Contexto,
  type FiltroDaLista,
  NaoEncontrado,
  TAMANHO_DA_PAGINA,
  validarPeriodoDaLista,
} from '@hubkeep/dominio';
import type {
  ChamadoResumido,
  EventoDaLinhaDoTempo,
  NomesDoChamado,
  OsResumida,
  PortaConsultasDaCorretiva,
} from '../portas/consultas';

export interface PedidoDeLista {
  hotelId?: string | null | undefined;
  situacaoId?: string | null | undefined;
  prioridadeId?: string | null | undefined;
  /** Início do período (ISO 8601, inclusive). */
  de?: string | null | undefined;
  /** Fim do período (ISO 8601, exclusive). */
  ate?: string | null | undefined;
  /** O `proximo` da página anterior. */
  depoisDe?: string | null | undefined;
  /** Só as OS do locador (1c, ADR-045); só a lista de OS usa. */
  doLocador?: boolean | undefined;
}

export interface Pagina<T> {
  itens: T[];
  /** Para pedir a página seguinte; null na última. */
  proximo: string | null;
}

export interface CasosDeUsoDeConsultas {
  listarChamados(ctx: Contexto, pedido: PedidoDeLista): Promise<Pagina<ChamadoResumido>>;
  listarOs(ctx: Contexto, pedido: PedidoDeLista): Promise<Pagina<OsResumida>>;
  /** 404 chamado_nao_encontrado se o chamado não é visível. */
  nomesDoChamado(ctx: Contexto, chamadoId: string): Promise<NomesDoChamado>;
  /** Os nomes da página da OS (PV3c); 404 os_nao_encontrada se a OS não é visível. */
  nomesDaOs(ctx: Contexto, osId: string): Promise<NomesDoChamado>;
  /** 404 chamado_nao_encontrado se o chamado não é visível. */
  linhaDoTempo(ctx: Contexto, chamadoId: string): Promise<EventoDaLinhaDoTempo[]>;
}

function filtroDe(p: PedidoDeLista): FiltroDaLista {
  const data = (v: string | null | undefined) => (v ? new Date(v) : null);
  const filtro: FiltroDaLista = {
    hotelId: p.hotelId ?? null,
    situacaoId: p.situacaoId ?? null,
    prioridadeId: p.prioridadeId ?? null,
    de: data(p.de),
    ate: data(p.ate),
    depoisDe: p.depoisDe ?? null,
    doLocador: p.doLocador ?? false,
  };
  validarPeriodoDaLista(filtro.de, filtro.ate);
  return filtro;
}

/** Pede um a mais que a página para saber se há a seguinte. */
async function paginar<T extends { id: string }>(
  ler: (limite: number) => Promise<T[]>,
): Promise<Pagina<T>> {
  const linhas = await ler(TAMANHO_DA_PAGINA + 1);
  const itens = linhas.slice(0, TAMANHO_DA_PAGINA);
  return {
    itens,
    proximo: linhas.length > TAMANHO_DA_PAGINA ? (itens.at(-1)?.id ?? null) : null,
  };
}

export function criarCasosDeUsoDeConsultas(deps: {
  consultas: PortaConsultasDaCorretiva;
}): CasosDeUsoDeConsultas {
  const nomes = async (ctx: Contexto, chamadoId: string) => {
    const n = await deps.consultas.nomesDoChamado(ctx, chamadoId);
    if (!n) throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
    return n;
  };
  return {
    async listarChamados(ctx, pedido) {
      const filtro = filtroDe(pedido);
      return paginar((limite) => deps.consultas.chamados(ctx, filtro, limite));
    },

    async listarOs(ctx, pedido) {
      const filtro = filtroDe(pedido);
      return paginar((limite) => deps.consultas.os(ctx, filtro, limite));
    },

    nomesDoChamado: nomes,

    async nomesDaOs(ctx, osId) {
      const n = await deps.consultas.nomesDaOs(ctx, osId);
      if (!n) throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
      return n;
    },

    async linhaDoTempo(ctx, chamadoId) {
      await nomes(ctx, chamadoId);
      return deps.consultas.linhaDoTempo(ctx, chamadoId);
    },
  };
}
