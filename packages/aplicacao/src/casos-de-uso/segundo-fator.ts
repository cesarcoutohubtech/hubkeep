// Remoção do segundo fator pelo Admin do grupo (SP1, ADR-049 e adendo ao
// ADR-024). Quem pede e o alvo são conferidos antes: a regra do domínio
// (Admin do grupo, nunca o próprio) e o membro visível no tenant de quem pede,
// pela RLS no hk_app. Só então o auth-admin remove os fatores, e a auditoria e
// o evento vão pela unit of work. O Auth não volta atrás: se a gravação da
// auditoria falhar, o erro sobe, e os fatores já foram removidos.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  exigir,
  podeRemoverSegundoFator,
} from '@hubkeep/dominio';
import type { AdministracaoDoSegundoFator } from '../portas/identidade';
import type { PortaMembros } from '../portas/membros';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface CasoDeUsoDoSegundoFator {
  removerSegundoFator(ctx: Contexto, usuarioId: string): Promise<{ removidos: number }>;
}

export function criarCasoDeUsoDoSegundoFator(deps: {
  membros: Pick<PortaMembros, 'existe' | 'registrarRemocaoDoSegundoFator'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  segundoFator: AdministracaoDoSegundoFator;
  relogio: Relogio;
  /** Padrão: a regra do domínio. Só o teste de aceite troca. */
  podeRemover?: (
    minhas: readonly Atribuicao[],
    eu: string,
    alvo: { usuarioId: string },
    agora: Date,
  ) => Resultado;
}): CasoDeUsoDoSegundoFator {
  const podeRemover = deps.podeRemover ?? podeRemoverSegundoFator;
  return {
    async removerSegundoFator(ctx, usuarioId) {
      exigir(
        podeRemover(
          await deps.atribuicoes.doUsuario(ctx),
          ctx.usuarioId,
          { usuarioId },
          deps.relogio.agora(),
        ),
      );
      if (!(await deps.membros.existe(ctx, usuarioId))) {
        throw new NaoEncontrado('membro_nao_encontrado', 'Membro não encontrado.');
      }
      const removidos = await deps.segundoFator.removerFatores(usuarioId);
      await deps.membros.registrarRemocaoDoSegundoFator(ctx, usuarioId, removidos);
      return { removidos };
    },
  };
}
