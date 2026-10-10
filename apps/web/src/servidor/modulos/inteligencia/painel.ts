// A ligação do painel do Intelligence (as telas do 1.0): as portas do
// @hubkeep/inteligencia (painel.ts) sobre o packages/db, com o hk_app e o
// contexto de quem pede. Aqui só a tradução das linhas para o motor; as regras
// (o módulo e o papel, a transição, o responsável, a substituição) são do
// motor, e a RLS da app.insight é a última palavra sobre quem lê e decide.
import type { PortaAtribuicoes, PortaModulos, Relogio } from '@hubkeep/aplicacao';
import type { InsightDoPainelNoBanco, PortaDoPainelDoIntelligence } from '@hubkeep/db';
import type { Contexto } from '@hubkeep/dominio';
import {
  type AcaoDoInsight,
  type FiltroDeEstadoDoInsight,
  type InsightDoPainel,
  LIMITE_DA_LISTA,
  type ListaDeInsights,
  type PaginaDoInsight,
  type PortasDoPainel,
  type ResumoDoPainel,
  type TipoDeInsight,
  decidirInsight,
  ehEstadoDoInsight,
  ehMotivoDeDescarte,
  ehTipoDeInsight,
  listarInsights,
  resumoDoPainel,
  verInsight,
} from '@hubkeep/inteligencia';

export interface DepsDoPainel {
  porta: PortaDoPainelDoIntelligence;
  modulos: PortaModulos;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
}

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

export interface CasosDeUsoDoPainel {
  resumo(ctx: Contexto): Promise<ResumoDoPainel>;
  listar(ctx: Contexto, pedido: PedidoDeListaDoPainel): Promise<ListaDeInsights>;
  ver(ctx: Contexto, insightId: string): Promise<PaginaDoInsight>;
  decidir(
    ctx: Contexto,
    insightId: string,
    pedido: PedidoDeDecisaoDoPainel,
  ): Promise<Awaited<ReturnType<typeof decidirInsight>>>;
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

export function portasDoPainel(deps: DepsDoPainel, ctx: Contexto): PortasDoPainel {
  const { porta } = deps;
  return {
    modulos: () => deps.modulos.contratados(ctx),
    atribuicoes: () => deps.atribuicoes.doUsuario(ctx),
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
  };
}

export function criarPainel(deps: DepsDoPainel): CasosDeUsoDoPainel {
  const agora = () => deps.relogio.agora();
  return {
    resumo: (ctx) => resumoDoPainel(portasDoPainel(deps, ctx), agora()),
    listar: (ctx, pedido) => listarInsights(portasDoPainel(deps, ctx), pedido, agora()),
    ver: (ctx, insightId) => verInsight(portasDoPainel(deps, ctx), insightId, agora()),
    decidir: (ctx, insightId, pedido) =>
      decidirInsight(
        portasDoPainel(deps, ctx),
        { ...pedido, insightId, usuarioId: ctx.usuarioId },
        agora(),
      ),
  };
}
