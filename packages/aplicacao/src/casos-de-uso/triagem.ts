// Triagem e atribuição (fase 1a, C3; ADR-027, ADR-029). O Admin do grupo, o
// Gestor CSC e o Gerente do hotel classificam o chamado, ajustam a
// prioridade, cancelam antes da OS e geram, reatribuem e cancelam a OS,
// atribuída a um Técnico do hotel ou a uma equipe do hotel. No fim (C6), quem
// abriu o chamado, se ainda escreve no hotel, ou o Gerente do hotel aceita a
// OS concluída ou a reabre com motivo (a mesma OS volta à execução, com o
// mesmo responsável); quem abriu e executa a OS não decide, só o Gerente. A
// reabertura com o equipamento parado abre a parada do ativo no mesmo
// chamado. Toda ação leva a versão lida pela tela: se o registro mudou, 409
// conflito_de_versao.
//
// Na I4: a triagem escolhe quem executa a OS (a equipe interna ou um
// fornecedor ativo do grupo) ao gerar e corrige até a conclusão; corrige o
// impacto no hóspede até o aceite; quem aceita informa o custo, opcional, em
// reais; e o cancelamento do chamado encerra o período aberto da UH.
//
// Na I6: quem aceita confirma ou corrige os códigos de falha, causa e solução
// que o técnico sugeriu; o código que não serve é recusado. Com a política
// os.codigos_obrigatorios ligada no hotel, o aceite exige os três
// (decisão do Cesar de 10/10/2026); a conclusão no PWA nunca é cobrada.
//
// Quem pode e para onde vai são do domínio (corretiva.ts e triagem.ts); a
// situação de cada estado é a ativa de menor ordem (situacaoPara). As
// checagens de papel são injetáveis, como o podeAbrir do chamado, para o
// teste de aceite provar que a RLS recusa sozinha.
import {
  type AtorDaCorretiva,
  type CandidatoAResponsavel,
  type CodigosDaOs,
  type Contexto,
  EXECUCAO_PADRAO,
  type ExecutadoPor,
  NaoEncontrado,
  type QuemExecuta,
  conflitoDeVersao,
  decidirNaOs,
  decidirNoChamado,
  decidirQuemExecuta,
  exigirPrioridadeAtiva,
  exigirAtivoNoChamado,
  exigirCodigosNoAceite,
  exigirResponsavelDoHotel,
  normalizarCustoInformado,
  podeAjustarPrioridade,
  podeAjustarQuemExecuta,
  podeInformarImpacto,
  resolverPolitica,
  situacaoPara,
  validarCodigosDaOs,
  validarParada,
} from '@hubkeep/dominio';
import type { PortaCodigos } from '../portas/codigos-manutencao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPrioridades, PortaSituacoes } from '../portas/situacoes';
import type { ChamadoParaTriagem, OsGravada, PortaTriagem } from '../portas/triagem';

const CODIGOS_OBRIGATORIOS = 'os.codigos_obrigatorios';

/** O responsável como a tela o escolhe. */
export type ResponsavelPedido =
  { tipo: 'tecnico'; usuarioId: string } | { tipo: 'equipe'; equipeId: string };

/** Quem executa a OS como a tela escolhe (I4). */
export interface ExecucaoPedida {
  executadoPor: ExecutadoPor;
  fornecedorId?: string | null | undefined;
}

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
  /** Sem a execução pedida, a OS é da equipe interna (I4). */
  gerarOs(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; responsavel: ResponsavelPedido; execucao?: ExecucaoPedida | undefined },
  ): Promise<{ id: string; versao: number; versaoDoChamado: number }>;
  /** Corrige quem executa a OS, até a conclusão (I4). */
  definirQuemExecuta(
    ctx: Contexto,
    osId: string,
    p: { versao: number } & ExecucaoPedida,
  ): Promise<{ versao: number }>;
  /** Corrige o impacto no hóspede, até o aceite (I4); null: não informado. */
  informarImpacto(
    ctx: Contexto,
    chamadoId: string,
    p: { versao: number; impactoHospede: boolean | null },
  ): Promise<{ versao: number }>;
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
  /**
   * Aceite da OS concluída: o chamado fica concluído (C6), com o custo
   * informado, opcional (I4). Com `codigos` (I6), os três substituem os da OS;
   * sem eles, ficam os sugeridos pelo técnico.
   */
  aceitarOs(
    ctx: Contexto,
    osId: string,
    p: {
      versao: number;
      custoInformado?: number | null | undefined;
      codigos?: CodigosDaOs | undefined;
    },
  ): Promise<{ versao: number; versaoDoChamado: number }>;
  /**
   * Reabertura da OS concluída, com motivo: a OS e o chamado voltam à execução
   * (C6). Com `paradoDesde`, o equipamento está parado: abre a parada do
   * ativo no mesmo chamado (a encerrada não reabre).
   */
  reabrirOs(
    ctx: Contexto,
    osId: string,
    p: { versao: number; motivo: string; paradoDesde?: string | null | undefined },
  ): Promise<{ versao: number; versaoDoChamado: number; paradaId: string | null }>;
  /** As OS do chamado visíveis a quem pede (RLS), da mais antiga para a mais nova. */
  osDoChamado(ctx: Contexto, chamadoId: string): Promise<OsGravada[]>;
}

/** As regras que o teste de aceite troca para provar a RLS sozinha. */
export interface RegrasDaTriagem {
  decidirNoChamado: typeof decidirNoChamado;
  decidirNaOs: typeof decidirNaOs;
  podeAjustarPrioridade: typeof podeAjustarPrioridade;
  exigirResponsavelDoHotel: typeof exigirResponsavelDoHotel;
  podeInformarImpacto: typeof podeInformarImpacto;
  podeAjustarQuemExecuta: typeof podeAjustarQuemExecuta;
}

export function criarCasosDeUsoDeTriagem(deps: {
  triagem: PortaTriagem;
  situacoes: Pick<PortaSituacoes, 'listar'>;
  prioridades: Pick<PortaPrioridades, 'listar'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Os códigos da OS no aceite (I6). Opcional só para os testes que não aceitam com código. */
  codigos?: Pick<PortaCodigos, 'listar' | 'categoriaDoAtivo'>;
  /** Padrão: as do domínio. Só o teste de aceite troca. */
  regras?: Partial<RegrasDaTriagem>;
}): CasosDeUsoDeTriagem {
  const r: RegrasDaTriagem = {
    decidirNoChamado,
    decidirNaOs,
    podeAjustarPrioridade,
    exigirResponsavelDoHotel,
    podeInformarImpacto,
    podeAjustarQuemExecuta,
    ...deps.regras,
  };

  async function ator(ctx: Contexto): Promise<AtorDaCorretiva> {
    return {
      usuarioId: ctx.usuarioId,
      atribuicoes: await deps.atribuicoes.doUsuario(ctx),
      equipes: [],
    };
  }

  /** No aceite, as equipes contam: quem abriu e é da equipe responsável executa a OS. */
  async function atorComEquipes(ctx: Contexto): Promise<AtorDaCorretiva> {
    const [atribuicoes, equipes] = await Promise.all([
      deps.atribuicoes.doUsuario(ctx),
      deps.triagem.equipesDoUsuario(ctx),
    ]);
    return { usuarioId: ctx.usuarioId, atribuicoes, equipes };
  }

  /** O ator e o que a regra do aceite lê além dele (Gerente único; Cesar, 30/09/2026). */
  const paraOAceite = (ctx: Contexto, chamado: ChamadoParaTriagem) =>
    Promise.all([
      atorComEquipes(ctx),
      deps.triagem.dadosDoAceite(ctx, { hotel: chamado.hotel, abertoPor: chamado.abertoPor }),
    ]);

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

  /** Quem executa, com o fornecedor lido com o contexto de quem pede (RLS). */
  async function quemExecuta(ctx: Contexto, pedido: ExecucaoPedida): Promise<QuemExecuta> {
    const fornecedorId = pedido.fornecedorId ?? null;
    const fornecedor =
      pedido.executadoPor === 'fornecedor' && fornecedorId !== null
        ? await deps.triagem.fornecedor(ctx, fornecedorId)
        : null;
    return decidirQuemExecuta(pedido, fornecedor);
  }

  /** Os códigos pedidos no aceite, conferidos contra a categoria do ativo do chamado (I6). */
  async function codigosDoAceite(
    ctx: Contexto,
    chamado: ChamadoParaTriagem,
    pedido: CodigosDaOs,
  ): Promise<CodigosDaOs> {
    if (!deps.codigos) throw new Error('Aceite com códigos sem a porta de códigos.');
    const [lista, categoria] = await Promise.all([
      deps.codigos.listar(ctx),
      chamado.ativoId === null ? null : deps.codigos.categoriaDoAtivo(ctx, chamado.ativoId),
    ]);
    return validarCodigosDaOs(pedido, lista, categoria);
  }

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
      const agora = deps.relogio.agora();
      const d = r.decidirNoChamado('cancelar', {
        ator: await ator(ctx),
        chamado,
        motivo: p.motivo,
        agora,
      });
      // O período aberto da UH encerra junto e fica fora dos UH-dias (I4).
      return deps.triagem.alterarChamado(ctx, chamadoId, p.versao, {
        acao: 'cancelar',
        estado: d.estado,
        situacaoId: situacaoPara(await situacoes(ctx), 'chamado', d.estado),
        motivoCancelamento: d.motivo ?? '',
        encerrarUhEm: agora,
      });
    },

    async informarImpacto(ctx, chamadoId, p) {
      const chamado = await chamadoNaVersao(ctx, chamadoId, p.versao);
      r.podeInformarImpacto(await ator(ctx), chamado, deps.relogio.agora());
      return deps.triagem.alterarChamado(ctx, chamadoId, p.versao, {
        acao: 'informar_impacto',
        impactoHospede: p.impactoHospede,
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
      const execucao = p.execucao ? await quemExecuta(ctx, p.execucao) : EXECUCAO_PADRAO;
      const lista = await situacoes(ctx);
      const estadoDoChamado = d.chamado ?? chamado.estado;
      return deps.triagem.gerarOs(ctx, {
        execucao,
        hotelId: chamado.hotel.id,
        localId: chamado.localId,
        chamadoAbertoPor: chamado.abertoPor,
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

    async definirQuemExecuta(ctx, osId, p) {
      const { os, chamado } = await osNaVersao(ctx, osId, p.versao);
      r.podeAjustarQuemExecuta(await ator(ctx), chamado, os.estado, deps.relogio.agora());
      const execucao = await quemExecuta(ctx, p);
      return deps.triagem.definirQuemExecuta(ctx, { osId, versao: p.versao, execucao });
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
        de: os.estado,
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
        de: os.estado,
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

    async aceitarOs(ctx, osId, p) {
      const { os, chamado } = await osNaVersao(ctx, osId, p.versao);
      const [ator, aceite] = await paraOAceite(ctx, chamado);
      const d = r.decidirNaOs('aceitar', {
        ator,
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        aceite,
        agora: deps.relogio.agora(),
      });
      const custoInformado = normalizarCustoInformado(p.custoInformado);
      const codigos = p.codigos ? await codigosDoAceite(ctx, chamado, p.codigos) : null;
      const politica = await deps.triagem.politica(ctx, chamado.hotel.id, CODIGOS_OBRIGATORIOS);
      exigirCodigosNoAceite(
        resolverPolitica(CODIGOS_OBRIGATORIOS, politica).ligado,
        codigos ?? os.codigos,
      );
      const lista = await situacoes(ctx);
      const estadoDoChamado = d.chamado ?? chamado.estado;
      return deps.triagem.aceitarOs(ctx, {
        codigos,
        custoInformado,
        osId,
        versao: p.versao,
        de: os.estado,
        situacaoId: situacaoPara(lista, 'os', d.estado),
        chamado: {
          id: chamado.id,
          versao: chamado.versao,
          estado: estadoDoChamado,
          situacaoId: situacaoPara(lista, 'chamado', estadoDoChamado),
        },
      });
    },

    async reabrirOs(ctx, osId, p) {
      const { os, chamado } = await osNaVersao(ctx, osId, p.versao);
      const agora = deps.relogio.agora();
      const [ator, aceite] = await paraOAceite(ctx, chamado);
      const d = r.decidirNaOs('reabrir', {
        ator,
        chamado,
        os: { estado: os.estado, responsavel: os.responsavel },
        aceite,
        motivo: p.motivo,
        agora,
      });
      const parada =
        p.paradoDesde == null
          ? null
          : {
              hotelId: chamado.hotel.id,
              ativoId: exigirAtivoNoChamado(chamado.ativoId),
              inicio: validarParada({ inicio: new Date(p.paradoDesde), fim: null }, agora).inicio,
            };
      const lista = await situacoes(ctx);
      const estadoDoChamado = d.chamado ?? chamado.estado;
      return deps.triagem.reabrirOs(ctx, {
        osId,
        versao: p.versao,
        de: os.estado,
        situacaoId: situacaoPara(lista, 'os', d.estado),
        motivo: d.motivo ?? '',
        chamado: {
          id: chamado.id,
          versao: chamado.versao,
          estado: estadoDoChamado,
          situacaoId: situacaoPara(lista, 'chamado', estadoDoChamado),
        },
        parada,
      });
    },

    // Quem vê o chamado vê as OS dele (policy de app.os); a rota confere o chamado antes.
    osDoChamado: (ctx, chamadoId) => deps.triagem.osDoChamado(ctx, chamadoId),
  };
}
