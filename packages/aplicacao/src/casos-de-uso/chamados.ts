// Abertura do chamado (fase 1a, C2; ADR-026, ADR-027). Local obrigatório,
// ativo opcional (no local), descrição; a foto vai depois, como anexo do
// chamado. Abre quem tem escrita no hotel, inclusive o Solicitante. A
// prioridade padrão vem da política por categoria (hotel → grupo → padrão), e
// a cópia do que foi aplicado fica no chamado: mudar a política depois não o
// altera. A situação inicial é a ativa de menor ordem do estado "aberto".
//
// A validação que lê o banco (prepararAbertura) é a mesma no web e na
// operação offline do PWA (chamado.abrir), que grava uma vez só (ADR-025).
import {
  type AtorDaCorretiva,
  type Contexto,
  NaoEncontrado,
  exigirAtivoDoChamado,
  exigirLocalParaChamado,
  normalizarDescricaoDoChamado,
  podeAbrirChamado,
  politicaAplicadaNaAbertura,
  prioridadePadraoDoChamado,
  resolverPolitica,
  situacaoPara,
} from '@hubkeep/dominio';
import type { ChamadoGravado, DadosDeChamado, PortaChamados } from '../portas/chamados';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPrioridades, PortaSituacoes } from '../portas/situacoes';

export interface PedidoDeAberturaDeChamado {
  localId: string;
  ativoId?: string | null | undefined;
  descricao: string;
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

    const [niveis, situacoes, prioridades] = await Promise.all([
      deps.chamados.politica(ctx, local.hotelId, CHAVE),
      deps.situacoes.listar(ctx),
      deps.prioridades.listar(ctx),
    ]);
    const prioridade = prioridadePadraoDoChamado({
      porCategoria: resolverPolitica(CHAVE, niveis),
      categoriaId,
      prioridades,
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
        politicaAplicada: politicaAplicadaNaAbertura({ categoriaId, prioridade }),
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
