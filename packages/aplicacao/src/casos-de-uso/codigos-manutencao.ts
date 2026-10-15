// Códigos de falha, causa e solução (fase 1b, I6): listar, criar, alterar os
// nomes, desativar, reativar e instalar os padrão do catálogo, e os códigos
// que servem para uma OS (a lista do aceite no web). O tipo e a categoria não
// mudam depois de criado (sem GRANT de UPDATE, migração 0036): para mudar,
// cria-se outro e desativa-se o antigo. A regra de quem gere é injetável para
// o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  CODIGOS_PADRAO,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  type Rotulos,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
  type TipoDeCodigoDeManutencao,
  codigosQueServem,
  exigir,
  normalizarRotulos,
  podeGerirCodigos,
  validarNomesDeCodigo,
  validarTipoDeCodigo,
} from '@hubkeep/dominio';
import type { Idioma } from '@hubkeep/i18n';
import type { PortaCategorias } from '../portas/categorias';
import type { CodigoGravado, PortaCodigos } from '../portas/codigos-manutencao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaTriagem } from '../portas/triagem';
import { lerOsComOrigem } from './origem-da-os';

export interface CodigoDeManutencao {
  id: string;
  tipo: TipoDeCodigoDeManutencao;
  categoriaId: string | null;
  chavePadrao: string | null;
  nomes: Rotulos;
  ativa: boolean;
}

export interface CasosDeUsoDeCodigos {
  /** Todos os códigos do tenant, inclusive os desativados (a OS antiga mostra o nome). */
  listarCodigos(ctx: Contexto): Promise<{ idiomaPadrao: Idioma; codigos: CodigoDeManutencao[] }>;
  criarCodigo(
    ctx: Contexto,
    c: { tipo: unknown; categoriaId: string | null; nomes: unknown },
  ): Promise<{ id: string }>;
  alterarCodigo(ctx: Contexto, id: string, nomes: unknown): Promise<void>;
  desativarCodigo(ctx: Contexto, id: string): Promise<void>;
  reativarCodigo(ctx: Contexto, id: string): Promise<void>;
  /**
   * Cria os códigos padrão que o tenant ainda não tem. A falha de uma
   * categoria padrão entra só se o tenant tiver essa categoria; chamar de novo
   * depois de instalar as categorias completa. Idempotente.
   */
  instalarCodigosPadrao(ctx: Contexto): Promise<{ instalados: number }>;
  /**
   * Os códigos que servem para a OS, por tipo (ativos, da categoria do ativo
   * do chamado primeiro, depois os de todas): a lista do aceite.
   */
  codigosParaOs(ctx: Contexto, osId: string): Promise<Record<TipoDeCodigoDeManutencao, string[]>>;
}

/** Leitura sem lançar: o que foi gravado fora do formato não quebra a lista. */
const paraCodigo = (c: CodigoGravado): CodigoDeManutencao => ({
  id: c.id,
  tipo: c.tipo,
  categoriaId: c.categoriaId,
  chavePadrao: c.chavePadrao,
  nomes: normalizarRotulos(c.nomes, true) ?? {},
  ativa: c.ativa,
});

export function criarCasosDeUsoDeCodigos(deps: {
  codigos: PortaCodigos;
  categorias: Pick<PortaCategorias, 'listar'>;
  triagem: Pick<PortaTriagem, 'os' | 'chamado'>;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirCodigos do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeCodigos {
  const podeGerir = deps.podeGerir ?? podeGerirCodigos;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
  const existente = async (ctx: Contexto, id: string) => {
    const c = (await deps.codigos.listar(ctx)).find((x) => x.id === id);
    if (!c) throw new NaoEncontrado('codigo_nao_encontrado', 'Código não encontrado.');
    return paraCodigo(c);
  };

  return {
    async listarCodigos(ctx) {
      const [idiomaPadrao, codigos] = await Promise.all([
        deps.codigos.idiomaPadrao(ctx),
        deps.codigos.listar(ctx),
      ]);
      return { idiomaPadrao, codigos: codigos.map(paraCodigo) };
    },

    async criarCodigo(ctx, c) {
      await exigirAdmin(ctx);
      const tipo = validarTipoDeCodigo(c.tipo);
      if (
        c.categoriaId !== null &&
        !(await deps.categorias.listar(ctx)).some((x) => x.id === c.categoriaId)
      ) {
        throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
      }
      return deps.codigos.criar(ctx, {
        tipo,
        categoriaId: c.categoriaId,
        chavePadrao: null,
        nomes: validarNomesDeCodigo(c.nomes, null),
      });
    },

    async alterarCodigo(ctx, id, nomes) {
      await exigirAdmin(ctx);
      const atual = await existente(ctx, id);
      await deps.codigos.alterar(ctx, id, {
        nomes: validarNomesDeCodigo(nomes, atual.chavePadrao),
      });
    },

    async desativarCodigo(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.codigos.alterar(ctx, id, { ativa: false });
    },

    async reativarCodigo(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.codigos.alterar(ctx, id, { ativa: true });
    },

    async instalarCodigosPadrao(ctx) {
      await exigirAdmin(ctx);
      const [codigos, categorias] = await Promise.all([
        deps.codigos.listar(ctx),
        deps.categorias.listar(ctx),
      ]);
      const ja = new Set(codigos.map((c) => `${c.tipo}:${c.chavePadrao}`));
      const categoriaPadrao = new Map(
        categorias.filter((c) => c.chavePadrao !== null).map((c) => [c.chavePadrao, c.id]),
      );
      let instalados = 0;
      for (const p of CODIGOS_PADRAO) {
        if (ja.has(`${p.tipo}:${p.chave}`)) continue;
        const categoriaId = p.categoria === null ? null : categoriaPadrao.get(p.categoria);
        if (categoriaId === undefined) continue;
        await deps.codigos.criar(ctx, {
          tipo: p.tipo,
          categoriaId,
          chavePadrao: p.chave,
          nomes: {},
        });
        instalados += 1;
      }
      return { instalados };
    },

    async codigosParaOs(ctx, osId) {
      // O ativo do chamado, na corretiva, ou o da ocorrência, na preventiva (PV3c).
      const { ativoId } = await lerOsComOrigem(deps.triagem, ctx, osId);
      const [codigos, categoria] = await Promise.all([
        deps.codigos.listar(ctx),
        ativoId === null ? Promise.resolve(null) : deps.codigos.categoriaDoAtivo(ctx, ativoId),
      ]);
      const porTipo = {} as Record<TipoDeCodigoDeManutencao, string[]>;
      for (const tipo of TIPOS_DE_CODIGO_DE_MANUTENCAO)
        porTipo[tipo] = codigosQueServem(codigos, tipo, categoria).map((c) => c.id);
      return porTipo;
    },
  };
}
