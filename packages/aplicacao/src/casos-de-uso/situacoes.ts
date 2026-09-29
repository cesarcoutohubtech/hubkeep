// Situações e prioridades do tenant (fase 1a, C1; ADR-027): listar, criar,
// alterar, desativar, reativar e instalar as padrão do catálogo. O estado
// canônico de cada situação e o que pode mudar são do domínio (situacoes.ts).
// A regra de quem gere é injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  type EntidadeComSituacao,
  NaoEncontrado,
  PRIORIDADES_PADRAO,
  type Resultado,
  type Rotulos,
  SITUACOES_PADRAO,
  exigir,
  exigirPrioridadeRestante,
  exigirSituacaoRestante,
  normalizarRotulos,
  podeGerirPrioridades,
  podeGerirSituacoes,
  validarCor,
  validarEstadoDaSituacao,
  validarNomesDeConfiguracao,
  validarOrdem,
  validarPeso,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type {
  PortaPrioridades,
  PortaSituacoes,
  PrioridadeGravada,
  SituacaoGravada,
} from '../portas/situacoes';

export interface Situacao {
  id: string;
  entidade: EntidadeComSituacao;
  estado: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  ordem: number;
  cor: string;
  ativa: boolean;
}

export interface Prioridade {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  ordem: number;
  peso: number;
  ativa: boolean;
}

export interface CasosDeUsoDeSituacoes {
  /** Situações e prioridades do tenant, na ordem da tela. */
  listarSituacoesEPrioridades(ctx: Contexto): Promise<{
    idiomaPadrao: Idioma;
    situacoes: Situacao[];
    prioridades: Prioridade[];
  }>;
  criarSituacao(
    ctx: Contexto,
    s: { entidade: unknown; estado: unknown; nomes: unknown; ordem: unknown; cor: unknown },
  ): Promise<{ id: string }>;
  alterarSituacao(
    ctx: Contexto,
    id: string,
    s: { nomes: unknown; ordem: unknown; cor: unknown },
  ): Promise<void>;
  /** Recusa a última situação ativa do estado (ultima_situacao_do_estado). */
  desativarSituacao(ctx: Contexto, id: string): Promise<void>;
  reativarSituacao(ctx: Contexto, id: string): Promise<void>;
  criarPrioridade(
    ctx: Contexto,
    p: { nomes: unknown; ordem: unknown; peso: unknown },
  ): Promise<{ id: string }>;
  alterarPrioridade(
    ctx: Contexto,
    id: string,
    p: { nomes: unknown; ordem: unknown; peso: unknown },
  ): Promise<void>;
  /** Recusa a última prioridade ativa (ultima_prioridade). */
  desativarPrioridade(ctx: Contexto, id: string): Promise<void>;
  reativarPrioridade(ctx: Contexto, id: string): Promise<void>;
  /** Cria as situações e prioridades padrão que o tenant ainda não tem. Idempotente. */
  instalarPadrao(ctx: Contexto): Promise<{ situacoes: number; prioridades: number }>;
}

const porOrdem = <T extends { ordem: number; id: string }>(a: T, b: T) =>
  a.ordem - b.ordem || a.id.localeCompare(b.id);

/** Leitura sem lançar: o que foi gravado fora do formato não quebra a lista. */
const paraSituacao = (s: SituacaoGravada): Situacao => ({
  ...s,
  nomes: normalizarRotulos(s.nomes, true) ?? {},
});
const paraPrioridade = (p: PrioridadeGravada): Prioridade => ({
  ...p,
  nomes: normalizarRotulos(p.nomes, true) ?? {},
});

export function criarCasosDeUsoDeSituacoes(deps: {
  situacoes: PortaSituacoes;
  prioridades: PortaPrioridades;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: as regras do domínio. Só o teste de aceite troca. */
  podeGerirSituacoes?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
  podeGerirPrioridades?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeSituacoes {
  const regraDeSituacoes = deps.podeGerirSituacoes ?? podeGerirSituacoes;
  const regraDePrioridades = deps.podeGerirPrioridades ?? podeGerirPrioridades;
  const exigirAdmin = async (
    ctx: Contexto,
    regra: (minhas: readonly Atribuicao[], agora: Date) => Resultado,
  ) => exigir(regra(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  const situacoes = async (ctx: Contexto) => (await deps.situacoes.listar(ctx)).map(paraSituacao);
  const prioridades = async (ctx: Contexto) =>
    (await deps.prioridades.listar(ctx)).map(paraPrioridade);
  const situacao = async (ctx: Contexto, id: string) => {
    const todas = await situacoes(ctx);
    const s = todas.find((x) => x.id === id);
    if (!s) throw new NaoEncontrado('situacao_nao_encontrada', 'Situação não encontrada.');
    return { s, todas };
  };
  const prioridade = async (ctx: Contexto, id: string) => {
    const todas = await prioridades(ctx);
    const p = todas.find((x) => x.id === id);
    if (!p) throw new NaoEncontrado('prioridade_nao_encontrada', 'Prioridade não encontrada.');
    return { p, todas };
  };

  return {
    async listarSituacoesEPrioridades(ctx) {
      const [idiomaPadrao, s, p] = await Promise.all([
        deps.situacoes.idiomaPadrao(ctx),
        situacoes(ctx),
        prioridades(ctx),
      ]);
      return { idiomaPadrao, situacoes: s.sort(porOrdem), prioridades: p.sort(porOrdem) };
    },

    async criarSituacao(ctx, s) {
      await exigirAdmin(ctx, regraDeSituacoes);
      return deps.situacoes.criar(ctx, {
        ...validarEstadoDaSituacao(s.entidade, s.estado),
        chavePadrao: null,
        nomes: validarNomesDeConfiguracao('situacao', s.nomes, null),
        ordem: validarOrdem(s.ordem),
        cor: validarCor(s.cor),
      });
    },

    async alterarSituacao(ctx, id, mudanca) {
      await exigirAdmin(ctx, regraDeSituacoes);
      const { s } = await situacao(ctx, id);
      await deps.situacoes.alterar(ctx, id, {
        nomes: validarNomesDeConfiguracao('situacao', mudanca.nomes, s.chavePadrao),
        ordem: validarOrdem(mudanca.ordem),
        cor: validarCor(mudanca.cor),
      });
    },

    async desativarSituacao(ctx, id) {
      await exigirAdmin(ctx, regraDeSituacoes);
      const { todas } = await situacao(ctx, id);
      exigirSituacaoRestante(todas, id);
      await deps.situacoes.alterar(ctx, id, { ativa: false });
    },

    async reativarSituacao(ctx, id) {
      await exigirAdmin(ctx, regraDeSituacoes);
      await situacao(ctx, id);
      await deps.situacoes.alterar(ctx, id, { ativa: true });
    },

    async criarPrioridade(ctx, p) {
      await exigirAdmin(ctx, regraDePrioridades);
      return deps.prioridades.criar(ctx, {
        chavePadrao: null,
        nomes: validarNomesDeConfiguracao('prioridade', p.nomes, null),
        ordem: validarOrdem(p.ordem),
        peso: validarPeso(p.peso),
      });
    },

    async alterarPrioridade(ctx, id, mudanca) {
      await exigirAdmin(ctx, regraDePrioridades);
      const { p } = await prioridade(ctx, id);
      await deps.prioridades.alterar(ctx, id, {
        nomes: validarNomesDeConfiguracao('prioridade', mudanca.nomes, p.chavePadrao),
        ordem: validarOrdem(mudanca.ordem),
        peso: validarPeso(mudanca.peso),
      });
    },

    async desativarPrioridade(ctx, id) {
      await exigirAdmin(ctx, regraDePrioridades);
      const { todas } = await prioridade(ctx, id);
      exigirPrioridadeRestante(todas, id);
      await deps.prioridades.alterar(ctx, id, { ativa: false });
    },

    async reativarPrioridade(ctx, id) {
      await exigirAdmin(ctx, regraDePrioridades);
      await prioridade(ctx, id);
      await deps.prioridades.alterar(ctx, id, { ativa: true });
    },

    async instalarPadrao(ctx) {
      await exigirAdmin(ctx, regraDeSituacoes);
      await exigirAdmin(ctx, regraDePrioridades);
      const jaS = new Set((await deps.situacoes.listar(ctx)).map((s) => s.chavePadrao));
      const jaP = new Set((await deps.prioridades.listar(ctx)).map((p) => p.chavePadrao));
      const faltamS = SITUACOES_PADRAO.filter((s) => !jaS.has(s.chave));
      const faltamP = PRIORIDADES_PADRAO.filter((p) => !jaP.has(p.chave));
      for (const s of faltamS)
        await deps.situacoes.criar(ctx, {
          entidade: s.entidade,
          estado: s.estado,
          chavePadrao: s.chave,
          nomes: {},
          ordem: s.ordem,
          cor: s.cor,
        });
      for (const p of faltamP)
        await deps.prioridades.criar(ctx, {
          chavePadrao: p.chave,
          nomes: {},
          ordem: p.ordem,
          peso: p.peso,
        });
      return { situacoes: faltamS.length, prioridades: faltamP.length };
    },
  };
}
