// Aprovação do cadastro dos ativos (fase 1b, M4; decisões do Cesar de
// 19/10/2026): a fila dos pendentes do hotel e a decisão (aprovar, ou recusar
// com motivo, o que desativa o ativo). Quem vê a fila e decide é a gestão do
// hotel (podeDecidirCadastro); a RLS decide por último. A regra de quem
// decide é injetável para o teste provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  exigir,
  podeDecidirCadastro,
  validarDecisaoDoCadastro,
} from '@hubkeep/dominio';
import type { CadastroPendente, PortaCadastrosDeAtivos } from '../portas/cadastros-de-ativos';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface PedidoDeDecisaoDoCadastro {
  decisao: unknown;
  motivo: string | null;
  /** A versão do ativo que quem decide viu (ADR-029). */
  versao: number;
}

export interface CasosDeUsoDeCadastrosDeAtivos {
  pendentes(ctx: Contexto, hotelId: string): Promise<CadastroPendente[]>;
  decidir(
    ctx: Contexto,
    ativoId: string,
    p: PedidoDeDecisaoDoCadastro,
  ): Promise<{ versao: number }>;
}

export function criarCasosDeUsoDeCadastrosDeAtivos(deps: {
  cadastros: PortaCadastrosDeAtivos;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeDecidirCadastro do domínio. Só o teste de aceite troca. */
  podeDecidir?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDeCadastrosDeAtivos {
  const podeDecidir = deps.podeDecidir ?? podeDecidirCadastro;
  const hotelDecidido = async (ctx: Contexto, hotelId: string) => {
    const hotel = await deps.cadastros.hotel(ctx, hotelId);
    if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    exigir(podeDecidir(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
    return hotel;
  };
  return {
    async pendentes(ctx, hotelId) {
      await hotelDecidido(ctx, hotelId);
      return deps.cadastros.pendentes(ctx, hotelId);
    },
    async decidir(ctx, ativoId, p) {
      const a = await deps.cadastros.ativo(ctx, ativoId);
      if (!a) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
      await hotelDecidido(ctx, a.hotelId);
      // O desativado sem decisão (quem cadastrou desistiu) não entra na fila nem é decidido.
      if (!a.ativo) throw new RegraViolada('ativo_desativado', 'O ativo está desativado.');
      const d = validarDecisaoDoCadastro(a.situacao, p.decisao, p.motivo);
      return deps.cadastros.decidir(ctx, {
        ativoId,
        hotelId: a.hotelId,
        versaoEsperada: p.versao,
        ...d,
      });
    },
  };
}
