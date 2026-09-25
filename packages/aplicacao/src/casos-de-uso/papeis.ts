// Casos de uso da F0-06: listar hotéis visíveis, conceder papel e revogar papel.
//
// As regras de escalada rodam AQUI, para dar mensagem clara (PermissaoNegada,
// RegraViolada), e de novo no banco, pela RLS — que é a garantia. Por isso as
// regras são injetáveis: o teste de aceite troca por uma regra que permite
// tudo e prova que o banco ainda bloqueia a escalada.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type PedidoDeConcessao,
  type Resultado,
  exigir,
  podeConcederPapel,
  podeRevogarPapel,
} from '@hubkeep/dominio';
import type { HotelVisivel, PortaAtribuicoes, PortaHoteis, Relogio } from '../portas/papeis';

export interface RegrasDePapeis {
  podeConceder(
    atribuicoes: readonly Atribuicao[],
    pedido: PedidoDeConcessao,
    agora: Date,
  ): Resultado;
  podeRevogar(atribuicoes: readonly Atribuicao[], alvo: Atribuicao, agora: Date): Resultado;
}

export const REGRAS_DO_DOMINIO: RegrasDePapeis = {
  podeConceder: podeConcederPapel,
  podeRevogar: podeRevogarPapel,
};

export interface DependenciasDePapeis {
  hoteis: PortaHoteis;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: as regras do domínio. Só o teste de aceite troca. */
  regras?: RegrasDePapeis;
}

export interface CasosDeUsoDePapeis {
  listarHoteisVisiveis(ctx: Contexto): Promise<HotelVisivel[]>;
  /** Só confere se a concessão seria permitida, sem gravar (usado antes de convidar). */
  verificarConcessao(ctx: Contexto, pedido: PedidoDeConcessao): Promise<void>;
  concederPapel(ctx: Contexto, pedido: PedidoDeConcessao): Promise<{ id: string }>;
  revogarPapel(ctx: Contexto, atribuicaoId: string): Promise<void>;
}

export function criarCasosDeUsoDePapeis(deps: DependenciasDePapeis): CasosDeUsoDePapeis {
  const regras = deps.regras ?? REGRAS_DO_DOMINIO;

  const verificarConcessao = async (ctx: Contexto, pedido: PedidoDeConcessao) => {
    const minhas = await deps.atribuicoes.doUsuario(ctx);
    exigir(regras.podeConceder(minhas, pedido, deps.relogio.agora()));
  };

  return {
    listarHoteisVisiveis: (ctx) => deps.hoteis.listarVisiveis(ctx),

    verificarConcessao,

    async concederPapel(ctx, pedido) {
      await verificarConcessao(ctx, pedido);
      return deps.atribuicoes.conceder(ctx, pedido);
    },

    async revogarPapel(ctx, atribuicaoId) {
      const alvo = await deps.atribuicoes.buscar(ctx, atribuicaoId);
      if (!alvo) throw new NaoEncontrado('Atribuição não encontrada.');
      const minhas = await deps.atribuicoes.doUsuario(ctx);
      exigir(regras.podeRevogar(minhas, alvo, deps.relogio.agora()));
      await deps.atribuicoes.revogar(ctx, atribuicaoId);
    },
  };
}

export const relogioDoSistema: Relogio = { agora: () => new Date() };
