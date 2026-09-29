// Triagem e atribuição (fase 1a, C3; ADR-027, ADR-029). O Admin do grupo, o
// Gestor CSC e o Gerente do hotel classificam o chamado, ajustam a
// prioridade, cancelam antes da OS e geram, reatribuem e cancelam a OS,
// atribuída a um Técnico do hotel ou a uma equipe do hotel. Toda ação leva a
// versão lida pela tela: se o registro mudou, 409 conflito_de_versao.
//
// Quem pode e para onde vai são do domínio (corretiva.ts e triagem.ts); a
// situação de cada estado é a ativa de menor ordem (situacaoPara). As
// checagens de papel são injetáveis, como o podeAbrir do chamado, para o
// teste de aceite provar que a RLS recusa sozinha.
import {
  type AtorDaCorretiva,
  type CandidatoAResponsavel,
  type Contexto,
  NaoEncontrado,
  conflitoDeVersao,
  decidirNaOs,
  decidirNoChamado,
  exigirPrioridadeAtiva,
  exigirResponsavelDoHotel,
  podeAjustarPrioridade,
  situacaoPara,
} from '@hubkeep/dominio';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPrioridades, PortaSituacoes } from '../portas/situacoes';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

/** O responsável como a tela o escolhe. */
export type ResponsavelPedido =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };

export interface CasosDeUsoDeTriagem {
  triar(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; prioridadeId?: string | null | undefined },
  ): Promise<{ versao: number }>;
  priorizar(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; prioridadeId: string },
  ): Promise<{ versao: number }>;
  cancelarChamado(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; motivo: string },
  ): Promise<{ versao: number }>;
  gerarOs(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; responsavel: ResponsavelPedido },
  ): Promise<{ id: string; versao: number; versaoDoChamado: number }>;
  reatribuirOs(
    ctx: Contexto,
    osId: string,
    p: { versao: number; responsavel: ResponsavelPedido },
  ): Promise<{ versao: number }>;
  cancelarOs(
    ctx: Contexto,
    osId: string,
    p: { versao: number; motivo: string },
  ): Promise<{ versao: number; versaoDoChamado: number }>;
  /** As OS do chamado visíveis a quem pede (RLS), da mais antiga para a mais nova. */
  osDoChamado(ctx: Contexto, chamadoId: string): Promise<OsGravada[]>;
}

/** As regras que o teste de aceite troca para provar a RLS sozinha. */
export interface RegrasDaTriagem {
  decidirNoChamado: typeof decidirNoChamado;
  decidirNaOs: typeof decidirNaOs;
  podeAjustarPrioridade: typeof podeAjustarPrioridade;
  exigirResponsavelDoHotel: typeof exigirResponsavelDoHotel;
}

export function criarCasosDeUsoDeTriagem(deps: {
  triagem: PortaTriagem;
  situacoes: Pick<PortaSituacoes, 'listar'>;
  prioridades: Pick<PortaPrioridades, 'listar'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: as do domínio. Só o teste de aceite troca. */
  regras?: Partial<RegrasDaTriagem>;
}): CasosDeUsoDeTriagem {
  const r: RegrasDaTriagem = {
    decidirNoChamado,
    decidirNaOs,
    podeAjustarPrioridade,
    exigirResponsavelDoHotel,
    ...deps.regras,
  };

  async function ator(ctx: Contexto): Promise<AtorDaCorretiva> {
    return {
      usuarioId: ctx.usuarioId,
      atribuicoes: await deps.atribuicoes.doUsuario(ctx),
      equipes: [],
    };
  }

  async function chamadoNaVersao(
    ctx: Contexto,
    chamadoId: string,
    versao: number,
  ): Promise<ChamadoParaTriagem> {
    const c = await deps.triagem.chamado(ctx, chamadoId);
    if (!c) throw new NaoEncontrado('chamado_nao_encontrado', 'Chamado não encontrado.');
    if (c.versao !== versao) throw conflitoDeVersao(c.versao);
    return c;
  }

  async function osNaVersao(ctx: Contexto, osId: string, versao: number) {
    const os = await deps.triagem.os(ctx, osId);
    if (!os) throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
    if (os.versao !== versao) throw conflitoDeVersao(os.versao);
    const chamado = await deps.triagem.chamado(ctx, os.chamadoId);
    if (!chamado) throw new NaoEncontrado('os_nao_encontrada', 'Ordem de serviço não encontrada.');
    return { os, chamado };
  }

  async function candidato(
    ctx: Contexto,
    pedido: ResponsavelPedido,
  ): Promise<CandidatoAResponsavel> {
    if (pedido.tipo === 'tecnico') {
      return {
        tipo: 'tecnico',
        usuarioId: pedido.usuarioId,
        atribuicoes: await deps.triagem.atribuicoesDe(ctx, pedido.usuarioId),
      };
    }
    const e = await deps.triagem.equipe(ctx, pedido.equipeId);
    if (!e) throw new NaoEncontrado('equipe_nao_encontrada', 'Equipe não encontrada.');
    return { tipo: 'equipe', equipeId: pedido.equipeId, hotelId: e.hotelId, ativa: e.ativa };
  }

  const situacoes = (ctx: Contexto) => deps.situacoes.listar(ctx);

  return {
    async triar(ctx, chamadoId, p) {
      const chamado = await chamadoNaVersao(ctx, chamadoId, p.versao);
      const agora = deps.relogio.agora();
      const d = r.decidirNoChamado('triar', { ator: await ator(ctx), chamado, agora });
      const prioridadeId = p.prioridadeId ?? null;
      if (prioridadeId !== null)
        exigirPrioridadeAtiva(await deps.prioridades.listar(ctx), prioridadeId);
      return deps.triagem.alterarChamado(ctx, chamadoId, p.versao, {
        acao: 'triar',
        estado: d.estado,
        situacaoId: situacaoPara(await situacoes(ctx), 'chamado', d.estado),
        ...(prioridadeId !== null ? { prioridadeId } : {}),
      });
    },

    async priorizar(ctx, chamadoId, p) {
      const chamado = await chamadoNaVersao(ctx, chamadoId, p.versao);
      r.podeAjustarPrioridade(await ator(ctx), chamado, deps.relogio.agora());
      exigirPrioridadeAtiva(await deps.prioridades.listar(ctx), p.prioridadeId);
      return deps.triagem.alterarChamado(ctx, chamadoId, p.versao, {
        acao: 'priorizar',
        prioridadeId: p.prioridadeId,
      });
    },

    async cancelarChamado(ctx, chamadoId, p) {
      const chamado = await chamadoNaVersao(ctx, chamadoId, p.versao);
      const d = r.decidirNoChamado('cancelar', {
        ator: await ator(ctx),
        chamado,
        motivo: p.motivo,
        agora: deps.relogio.agora(),
      });
      return deps.triagem.alterarChamado(ctx, chamadoId, p.versao, {
        acao: 'cancelar',
        estado: d.estado,
        situacaoId: situacaoPara(await situacoes(ctx), 'chamado', d.estado),
        motivoCancelamento: d.motivo ?? '',
      });
    },

    async gerarOs(ctx, chamadoId, p) {
      const chamado = await chamadoNaVersao(ctx, chamadoId, p.versao);
      const agora = deps.relogio.agora();
      const existentes = await deps.triagem.osDoChamado(ctx, chamadoId);
      const d = r.decidirNaOs('gerar', {
        ator: await ator(ctx),
        chamado,
        os: null,
        osDoChamado: existentes.map((o) => o.estado),
        agora,
      });
      const responsavel = r.exigirResponsavelDoHotel(
        await candidato(ctx, p.responsavel),
        chamado.hotel,
        agora,
      );
      const lista = await situacoes(ctx);
      const estadoDoChamado = d.chamado ?? chamado.estado;
      return deps.triagem.gerarOs(ctx, {
        hotelId: chamado.hotel.id,
        situacaoId: situacaoPara(lista, 'os', d.estado),
        responsavel,
        chamado: {
          id: chamado.id,
          versao: chamado.versao,
          estado: estadoDoChamado,
          situacaoId: situacaoPara(lista, 'chamado', estadoDoChamado),
        },
      });
    },

    async reatribuirOs(ctx, osId, p) {
      const { os, chamado } = await osNaVersao(ctx, osId, p.versao);
      const agora = deps.relogio.agora();
      const d = r.decidirNaOs('reatribuir', {
        ator: await ator(ctx),
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        agora,
      });
      const responsavel = r.exigirResponsavelDoHotel(
        await candidato(ctx, p.responsavel),
        chamado.hotel,
        agora,
      );
      return deps.triagem.reatribuirOs(ctx, {
        osId,
        versao: p.versao,
        situacaoId: situacaoPara(await situacoes(ctx), 'os', d.estado),
        responsavel,
      });
    },

    async cancelarOs(ctx, osId, p) {
      const { os, chamado } = await osNaVersao(ctx, osId, p.versao);
      const d = r.decidirNaOs('cancelar', {
        ator: await ator(ctx),
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        motivo: p.motivo,
        agora: deps.relogio.agora(),
      });
      const lista = await situacoes(ctx);
      const estadoDoChamado = d.chamado ?? chamado.estado;
      return deps.triagem.cancelarOs(ctx, {
        osId,
        versao: p.versao,
        situacaoId: situacaoPara(lista, 'os', d.estado),
        motivo: d.motivo ?? '',
        chamado: {
          id: chamado.id,
          versao: chamado.versao,
          estado: estadoDoChamado,
          situacaoId: situacaoPara(lista, 'chamado', estadoDoChamado),
        },
      });
    },

    // Quem vê o chamado vê as OS dele (policy de app.os); a rota confere o chamado antes.
    osDoChamado: (ctx, chamadoId) => deps.triagem.osDoChamado(ctx, chamadoId),
  };
}
