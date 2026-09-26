// Gestão de membros (fase 1a, A3): lista, desativação e reativação, e mudança
// de validade. Conceder e revogar papel ficam nos casos de uso de papéis (F0-06)
// e convidar, no de convites (F0-05). As regras são do domínio e, como nos
// papéis, injetáveis para o teste de aceite provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  exigir,
  podeAlterarAtivoDoMembro,
  podeAlterarValidade,
  podeGerirMembros,
} from '@hubkeep/dominio';
import type { MembroComAtribuicoes, PortaMembros } from '../portas/membros';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface RegrasDeMembros {
  podeGerir(minhas: readonly Atribuicao[], agora: Date): Resultado;
  podeAlterarAtivo(
    minhas: readonly Atribuicao[],
    eu: string,
    alvo: { usuarioId: string },
    agora: Date,
  ): Resultado;
  podeAlterarValidade(
    minhas: readonly Atribuicao[],
    alvo: Atribuicao,
    novaValidade: Date | null,
    agora: Date,
  ): Resultado;
}

export const REGRAS_DE_MEMBROS: RegrasDeMembros = {
  podeGerir: podeGerirMembros,
  podeAlterarAtivo: podeAlterarAtivoDoMembro,
  podeAlterarValidade,
};

export interface CasosDeUsoDeMembros {
  listarMembros(ctx: Contexto): Promise<MembroComAtribuicoes[]>;
  desativarMembro(ctx: Contexto, usuarioId: string): Promise<void>;
  reativarMembro(ctx: Contexto, usuarioId: string): Promise<void>;
  alterarValidade(ctx: Contexto, atribuicaoId: string, validoAte: Date | null): Promise<void>;
}

export function criarCasosDeUsoDeMembros(deps: {
  membros: PortaMembros;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: as regras do domínio. Só o teste de aceite troca. */
  regras?: RegrasDeMembros;
}): CasosDeUsoDeMembros {
  const regras = deps.regras ?? REGRAS_DE_MEMBROS;
  const minhas = (ctx: Contexto) => deps.atribuicoes.doUsuario(ctx);

  const definirAtivo = async (ctx: Contexto, usuarioId: string, ativo: boolean) => {
    exigir(
      regras.podeAlterarAtivo(
        await minhas(ctx),
        ctx.usuarioId,
        { usuarioId },
        deps.relogio.agora(),
      ),
    );
    await deps.membros.definirAtivo(ctx, usuarioId, ativo);
  };

  return {
    async listarMembros(ctx) {
      exigir(regras.podeGerir(await minhas(ctx), deps.relogio.agora()));
      return deps.membros.listar(ctx);
    },

    desativarMembro: (ctx, usuarioId) => definirAtivo(ctx, usuarioId, false),
    reativarMembro: (ctx, usuarioId) => definirAtivo(ctx, usuarioId, true),

    async alterarValidade(ctx, atribuicaoId, validoAte) {
      const alvo = await deps.atribuicoes.buscar(ctx, atribuicaoId);
      if (!alvo) throw new NaoEncontrado('atribuicao_nao_encontrada', 'Atribuição não encontrada.');
      exigir(regras.podeAlterarValidade(await minhas(ctx), alvo, validoAte, deps.relogio.agora()));
      await deps.membros.alterarValidade(ctx, atribuicaoId, validoAte);
    },
  };
}
