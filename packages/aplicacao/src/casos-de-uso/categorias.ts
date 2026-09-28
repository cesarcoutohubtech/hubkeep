// Categorias de ativo (fase 1a, B2; ADR-028): listar, criar, alterar nomes e
// campos, desativar, reativar e instalar as categorias padrão do catálogo.
// O formato das definições e o que pode mudar nelas são do domínio
// (campos-tipados.ts). A regra de quem gere é injetável para o teste provar
// que a RLS ainda barra.
import {
  type Atribuicao,
  CATEGORIAS_PADRAO,
  type Contexto,
  type DefinicaoDeCampo,
  NaoEncontrado,
  type Resultado,
  type Rotulos,
  exigir,
  lerDefinicoes,
  normalizarRotulos,
  podeGerirCategorias,
  validarDefinicoes,
  validarMudancaDeDefinicoes,
  validarNomesDeCategoria,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type { CategoriaGravada, PortaCategorias } from '../portas/categorias';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface CategoriaDeAtivo {
  id: string;
  chavePadrao: string | null;
  nomes: Rotulos;
  campos: DefinicaoDeCampo[];
  ativa: boolean;
}

export interface CasosDeUsoDeCategorias {
  listarCategorias(
    ctx: Contexto,
  ): Promise<{ idiomaPadrao: Idioma; categorias: CategoriaDeAtivo[] }>;
  criarCategoria(ctx: Contexto, nomes: unknown, campos: unknown): Promise<{ id: string }>;
  alterarCategoria(ctx: Contexto, id: string, nomes: unknown, campos: unknown): Promise<void>;
  desativarCategoria(ctx: Contexto, id: string): Promise<void>;
  reativarCategoria(ctx: Contexto, id: string): Promise<void>;
  /** Cria as categorias padrão que o tenant ainda não tem. Idempotente. */
  instalarCategoriasPadrao(ctx: Contexto): Promise<{ instaladas: number }>;
}

/** Leitura sem lançar: o que foi gravado fora do formato não quebra a lista. */
const paraCategoria = (c: CategoriaGravada): CategoriaDeAtivo => ({
  id: c.id,
  chavePadrao: c.chavePadrao,
  nomes: normalizarRotulos(c.nomes, true) ?? {},
  campos: lerDefinicoes(c.campos),
  ativa: c.ativa,
});

export function criarCasosDeUsoDeCategorias(deps: {
  categorias: PortaCategorias;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirCategorias do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeCategorias {
  const podeGerir = deps.podeGerir ?? podeGerirCategorias;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
  const existente = async (ctx: Contexto, id: string) => {
    const c = (await deps.categorias.listar(ctx)).find((x) => x.id === id);
    if (!c) throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
    return paraCategoria(c);
  };

  return {
    async listarCategorias(ctx) {
      const [idiomaPadrao, categorias] = await Promise.all([
        deps.categorias.idiomaPadrao(ctx),
        deps.categorias.listar(ctx),
      ]);
      return { idiomaPadrao, categorias: categorias.map(paraCategoria) };
    },

    async criarCategoria(ctx, nomes, campos) {
      await exigirAdmin(ctx);
      return deps.categorias.criar(ctx, {
        chavePadrao: null,
        nomes: validarNomesDeCategoria(nomes, null),
        campos: validarDefinicoes(campos),
      });
    },

    async alterarCategoria(ctx, id, nomes, campos) {
      await exigirAdmin(ctx);
      const atual = await existente(ctx, id);
      const novas = validarDefinicoes(campos);
      validarMudancaDeDefinicoes(atual.campos, novas);
      await deps.categorias.alterar(ctx, id, {
        nomes: validarNomesDeCategoria(nomes, atual.chavePadrao),
        campos: novas,
      });
    },

    async desativarCategoria(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.categorias.alterar(ctx, id, { ativa: false });
    },

    async reativarCategoria(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.categorias.alterar(ctx, id, { ativa: true });
    },

    async instalarCategoriasPadrao(ctx) {
      await exigirAdmin(ctx);
      const ja = new Set((await deps.categorias.listar(ctx)).map((c) => c.chavePadrao));
      const faltam = CATEGORIAS_PADRAO.filter((c) => !ja.has(c));
      for (const chavePadrao of faltam)
        await deps.categorias.criar(ctx, { chavePadrao, nomes: {}, campos: [] });
      return { instaladas: faltam.length };
    },
  };
}
