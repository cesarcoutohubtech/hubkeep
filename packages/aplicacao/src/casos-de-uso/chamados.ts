// Abertura do chamado (fase 1a, C2; ADR-026, ADR-027). Local obrigatório,
// ativo opcional (no local), descrição; a foto vai depois, como anexo do
// chamado. Abre quem tem escrita no hotel, inclusive o Solicitante. A
// prioridade padrão vem da política por categoria (hotel → grupo → padrão), e
// a cópia do que foi aplicado fica no chamado: mudar a política depois não o
// altera. A situação inicial é a ativa de menor ordem do estado "aberto".
//
// A validação que lê o banco (prepararAbertura) é a mesma no web e na
// operação offline do PWA (chamado.abrir), que grava uma vez só (ADR-025).
// Quem abre pode marcar o equipamento como parado (C5): a parada aberta do
// ativo nasce na mesma unit of work; se o ativo já estava parado, fica a
// parada que existe e o chamado abre do mesmo jeito. Na I4, quem abre também
// responde se afeta hóspede (sim, não ou não sei) e se a UH ficou
// indisponível: o período aberto da UH nasce na mesma unit of work. A origem
// é gravada pelo servidor, sempre interna.
//
// Na 1c (ADR-042): a categoria do chamado vem do ativo, e os prazos de
// atendimento e de solução saem da chamado.sla e do horário de atendimento
// resolvidos para o hotel, no calendário dele; a cópia das duas políticas vai
// em politica_aplicada.
import {
  type AtorDaCorretiva,
  type Contexto,
  NaoEncontrado,
  ORIGEM_PADRAO_DO_CHAMADO,
  exigirAtivoDoChamado,
  exigirAtivoNoChamado,
  exigirLocalParaChamado,
  exigirUhParaIndisponibilidade,
  normalizarDescricaoDoChamado,
  podeAbrirChamado,
  politicaAplicadaNaAbertura,
  prazosDoChamado,
  prioridadePadraoDoChamado,
  regraDeSla,
  resolverPolitica,
  situacaoPara,
  validarInicioDaIndisponibilidade,
  validarParada,
} from '@hubkeep/dominio';
import type { FeriadosOficiais } from '../portas/calendario-sla';
import type { ChamadoGravado, DadosDeChamado, PortaChamados } from '../portas/chamados';
import { montarCalendarioDeSla } from './calendario-sla';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPrioridades, PortaSituacoes } from '../portas/situacoes';

export interface PedidoDeAberturaDeChamado {
  localId: string;
  ativoId?: string | null | undefined;
  descricao: string;
  /** Equipamento parado desde (ISO 8601; C5): exige o ativo. */
  paradoDesde?: string | null | undefined;
  /** Afeta hóspede? null ou ausente: não informado (I4). */
  impactoHospede?: boolean | null | undefined;
  /** A UH indisponível desde (ISO 8601; I4): só em chamado de UH. */
  uhIndisponivelDesde?: string | null | undefined;
}

export interface CasosDeUsoDeChamados {
  /** Valida e resolve prioridade e situação; não grava. */
  prepararAbertura(
    ctx: Contexto,
    pedido: PedidoDeAberturaDeChamado,
  ): Promise<{ hotelId: string; dados: DadosDeChamado }>;
  abrir(ctx: Contexto, pedido: PedidoDeAberturaDeChamado): Promise<{ id: string; versao: number }>;
  /** O chamado, se visível a quem pede (RLS); senão 404 chamado_nao_encontrado. */
  chamado(ctx: Contexto, chamadoId: string): Promise<ChamadoGravado>;
}

const CHAVE = 'chamado.prioridade_padrao_por_categoria';

export function criarCasosDeUsoDeChamados(deps: {
  chamados: PortaChamados;
  situacoes: Pick<PortaSituacoes, 'listar'>;
  prioridades: Pick<PortaPrioridades, 'listar'>;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Os feriados oficiais do calendário de SLA (1c, ADR-042). */
  feriadosOficiais: FeriadosOficiais;
  /** Padrão: podeAbrirChamado do domínio. Só o teste de aceite troca. */
  podeAbrir?: typeof podeAbrirChamado;
}): CasosDeUsoDeChamados {
  const podeAbrir = deps.podeAbrir ?? podeAbrirChamado;

  async function prepararAbertura(ctx: Contexto, pedido: PedidoDeAberturaDeChamado) {
    const local = await deps.chamados.local(ctx, pedido.localId);
    if (!local) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
    const hotel = await deps.chamados.hotel(ctx, local.hotelId);
    if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    const ator: AtorDaCorretiva = {
      usuarioId: ctx.usuarioId,
      atribuicoes: await deps.atribuicoes.doUsuario(ctx),
      equipes: [],
    };
    podeAbrir(ator, hotel, deps.relogio.agora());
    exigirLocalParaChamado(local);
    const descricao = normalizarDescricaoDoChamado(pedido.descricao);

    let categoriaId: string | null = null;
    const ativoId = pedido.ativoId ?? null;
    if (ativoId !== null) {
      const ativo = await deps.chamados.ativo(ctx, ativoId);
      if (!ativo || ativo.hotelId !== local.hotelId)
        throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      exigirAtivoDoChamado(ativo, local.id);
      categoriaId = ativo.categoriaId;
    }

    // Equipamento parado (C5): a parada aberta nasce com o chamado.
    let paradaDesde: Date | null = null;
    if (pedido.paradoDesde != null) {
      exigirAtivoNoChamado(ativoId);
      paradaDesde = validarParada(
        { inicio: new Date(pedido.paradoDesde), fim: null },
        deps.relogio.agora(),
      ).inicio;
    }

    // UH indisponível (I4): o período aberto nasce com o chamado.
    let uhIndisponivelDesde: Date | null = null;
    if (pedido.uhIndisponivelDesde != null) {
      exigirUhParaIndisponibilidade(local);
      uhIndisponivelDesde = validarInicioDaIndisponibilidade(
        new Date(pedido.uhIndisponivelDesde),
        deps.relogio.agora(),
      );
    }

    const [niveis, situacoes, prioridades, niveisDoSla, niveisDoHorario, dadosDoCalendario] =
      await Promise.all([
        deps.chamados.politica(ctx, local.hotelId, CHAVE),
        deps.situacoes.listar(ctx),
        deps.prioridades.listar(ctx),
        deps.chamados.politica(ctx, local.hotelId, 'chamado.sla'),
        deps.chamados.politica(ctx, local.hotelId, 'hotel.horario_atendimento'),
        deps.chamados.calendario(ctx, local.hotelId),
      ]);
    if (!dadosDoCalendario)
      throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    const prioridade = prioridadePadraoDoChamado({
      porCategoria: resolverPolitica(CHAVE, niveis),
      categoriaId,
      prioridades,
    });

    // Os prazos de SLA (ADR-042), da abertura, com a cópia das duas políticas.
    const sla = resolverPolitica('chamado.sla', niveisDoSla);
    const horario = resolverPolitica('hotel.horario_atendimento', niveisDoHorario);
    const daPrioridade = prioridades.find((p) => p.id === prioridade.prioridadeId);
    if (!daPrioridade) throw new Error('Prioridade resolvida fora da lista do tenant.');
    const abertoEm = deps.relogio.agora();
    const prazos = prazosDoChamado({
      abertoEm,
      regra: regraDeSla({ sla, prioridade: daPrioridade, prioridades, categoriaId }),
      calendario: montarCalendarioDeSla(
        deps.feriadosOficiais,
        dadosDoCalendario,
        { 'chamado.sla': sla, 'hotel.horario_atendimento': horario },
        abertoEm,
      ),
    });
    return {
      hotelId: local.hotelId,
      dados: {
        localId: local.id,
        ativoId,
        descricao,
        estado: 'aberto' as const,
        situacaoId: situacaoPara(situacoes, 'chamado', 'aberto'),
        prioridadeId: prioridade.prioridadeId,
        politicaAplicada: politicaAplicadaNaAbertura({ categoriaId, prioridade, sla, horario }),
        categoriaId,
        ...prazos,
        origem: ORIGEM_PADRAO_DO_CHAMADO,
        impactoHospede: pedido.impactoHospede ?? null,
        uhIndisponivelDesde,
        paradaDesde,
      },
    };
  }

  return {
    prepararAbertura,

    async abrir(ctx, pedido) {
      const { hotelId, dados } = await prepararAbertura(ctx, pedido);
      return deps.chamados.criar(ctx, hotelId, dados);
    },

    async chamado(ctx, chamadoId) {
      const c = await deps.chamados.chamado(ctx, chamadoId);
      if (!c) throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
      return c;
    },
  };
}
