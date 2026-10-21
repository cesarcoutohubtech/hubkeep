// Modelos de ativo por categoria (fase 1b, M1): listar (quem cadastra ativo,
// inclusive o Técnico, para o PWA offline), criar, alterar, desativar e
// reativar (só o Admin do grupo). As regras são do domínio
// (modelos-de-ativo.ts); a RLS decide por último. A regra de quem pode é
// injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Periodicidade,
  type Resultado,
  type ValorDeCampo,
  exigir,
  lerDefinicoes,
  lerPlanoSugerido,
  lerValores,
  podeGerirModelosDeAtivo,
  validarModeloDeAtivo,
} from '@hubkeep/dominio';
import type { ModeloDeAtivoGravado, PortaModelosDeAtivo } from '../portas/modelos-de-ativo';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface ModeloDeAtivo {
  id: string;
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  /** Lidos com a definição atual da categoria: o que ela não aceita fica de fora. */
  campos: Record<string, ValorDeCampo>;
  checklistModeloId: string | null;
  planoSugerido: Periodicidade | null;
  versao: number;
  ativa: boolean;
  /** PB1b: nulo vale para o grupo inteiro. */
  bandeiraId: string | null;
}

export interface PedidoDeModeloDeAtivo {
  categoriaId: string;
  nome: string;
  fabricante: string | null;
  modelo: string | null;
  campos?: unknown;
  checklistModeloId: string | null;
  planoSugerido: { intervalo: unknown; unidade: unknown } | null;
}

export interface CasosDeUsoDeModelosDeAtivo {
  listar(ctx: Contexto): Promise<ModeloDeAtivo[]>;
  /** A bandeira (PB1b) só se escolhe na criação; ausente ou nula: do grupo. */
  criar(
    ctx: Contexto,
    p: PedidoDeModeloDeAtivo & { bandeiraId?: string | null | undefined },
  ): Promise<{ id: string }>;
  /** Leva a versão que o Admin viu (ADR-029); a versão sobe a cada gravação. */
  alterar(
    ctx: Contexto,
    id: string,
    p: PedidoDeModeloDeAtivo & { versao: number },
  ): Promise<{ versao: number }>;
  desativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
  reativar(ctx: Contexto, id: string, versao: number): Promise<{ versao: number }>;
}

export function criarCasosDeUsoDeModelosDeAtivo(deps: {
  modelos: PortaModelosDeAtivo;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: a do domínio. Só o teste de aceite troca, para provar a RLS sozinha. */
  regras?: { podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado };
}): CasosDeUsoDeModelosDeAtivo {
  const podeGerir = deps.regras?.podeGerir ?? podeGerirModelosDeAtivo;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));

  const naoEncontrado = () =>
    new NaoEncontrado('modelo_ativo_nao_encontrado', 'Modelo de ativo não encontrado.');

  const definicoesPorCategoria = async (ctx: Contexto) =>
    new Map(
      (await deps.modelos.categorias(ctx)).map((c) => [
        c.id,
        { id: c.id, ativa: c.ativa, definicoes: lerDefinicoes(c.campos) },
      ]),
    );

  const paraModelo = (
    m: ModeloDeAtivoGravado,
    categorias: Awaited<ReturnType<typeof definicoesPorCategoria>>,
  ): ModeloDeAtivo => ({
    id: m.id,
    categoriaId: m.categoriaId,
    nome: m.nome,
    fabricante: m.fabricante,
    modelo: m.modelo,
    campos: lerValores(categorias.get(m.categoriaId)?.definicoes ?? [], m.campos),
    checklistModeloId: m.checklistModeloId,
    planoSugerido: lerPlanoSugerido(m.planoSugerido),
    versao: m.versao,
    ativa: m.ativa,
    bandeiraId: m.bandeiraId,
  });

  /** Valida o pedido contra a categoria e o checklist que o Admin enxerga. */
  const validar = async (
    ctx: Contexto,
    p: PedidoDeModeloDeAtivo,
    categoriaAnterior: string | null,
    bandeiraId: string | null,
  ) => {
    const [categorias, checklists] = await Promise.all([
      definicoesPorCategoria(ctx),
      p.checklistModeloId ? deps.modelos.checklists(ctx) : Promise.resolve([]),
    ]);
    const categoria = categorias.get(p.categoriaId);
    if (!categoria) {
      throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
    }
    let checklist = null;
    if (p.checklistModeloId) {
      checklist = checklists.find((c) => c.id === p.checklistModeloId) ?? null;
      if (!checklist) {
        throw new NaoEncontrado('checklist_nao_encontrado', 'Checklist não encontrado.');
      }
    }
    return validarModeloDeAtivo(
      { ...p, campos: p.campos },
      categoria,
      checklist,
      categoriaAnterior,
      bandeiraId,
    );
  };

  const existente = async (ctx: Contexto, id: string) => {
    const m = (await deps.modelos.listar(ctx)).find((x) => x.id === id);
    if (!m) throw naoEncontrado();
    return m;
  };

  return {
    async listar(ctx) {
      const [modelos, categorias] = await Promise.all([
        deps.modelos.listar(ctx),
        definicoesPorCategoria(ctx),
      ]);
      return modelos.map((m) => paraModelo(m, categorias));
    },

    async criar(ctx, p) {
      await exigirAdmin(ctx);
      const bandeiraId = p.bandeiraId ?? null;
      if (bandeiraId !== null && !(await deps.modelos.bandeira(ctx, bandeiraId))) {
        throw new NaoEncontrado('bandeira_nao_encontrada', 'Bandeira não encontrada.');
      }
      return deps.modelos.criar(ctx, await validar(ctx, p, null, bandeiraId), bandeiraId);
    },

    async alterar(ctx, id, p) {
      await exigirAdmin(ctx);
      const atual = await existente(ctx, id);
      return deps.modelos.alterar(
        ctx,
        id,
        p.versao,
        await validar(ctx, p, atual.categoriaId, atual.bandeiraId),
      );
    },

    async desativar(ctx, id, versao) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      return deps.modelos.alterar(ctx, id, versao, { ativa: false });
    },

    async reativar(ctx, id, versao) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      return deps.modelos.alterar(ctx, id, versao, { ativa: true });
    },
  };
}
