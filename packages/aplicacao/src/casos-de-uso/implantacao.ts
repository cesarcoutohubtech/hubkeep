// Painel de implantação do hotel (fase 1a, A5): quem vê é o Admin do grupo ou
// o Implantador vigente do hotel; o resumo e as pendências são do domínio. A
// regra de quem vê é injetável para o teste provar que a RLS ainda recorta.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  type ResumoDeImplantacao,
  exigir,
  podeVerImplantacao,
  resumirImplantacao,
} from '@hubkeep/dominio';
import type { HotelEmImplantacao, PortaImplantacao } from '../portas/implantacao';
import type { PortaMembros } from '../portas/membros';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface CasosDeUsoDeImplantacao {
  painel(
    ctx: Contexto,
    hotelId: string,
  ): Promise<ResumoDeImplantacao & { hotel: HotelEmImplantacao }>;
}

export function criarCasosDeUsoDeImplantacao(deps: {
  implantacao: PortaImplantacao;
  membros: PortaMembros;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeVerImplantacao do domínio. Só o teste de aceite troca. */
  podeVer?: (minhas: readonly Atribuicao[], hotelId: string, agora: Date) => Resultado;
}): CasosDeUsoDeImplantacao {
  const podeVer = deps.podeVer ?? podeVerImplantacao;
  return {
    async painel(ctx, hotelId) {
      const agora = deps.relogio.agora();
      exigir(podeVer(await deps.atribuicoes.doUsuario(ctx), hotelId, agora));
      const hotel = await deps.implantacao.hotel(ctx, hotelId);
      if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
      const [locais, pessoas, ativos] = await Promise.all([
        deps.implantacao.locais(ctx, hotelId),
        deps.membros.listar(ctx),
        deps.implantacao.ativos(ctx, hotelId),
      ]);
      return { hotel, ...resumirImplantacao(hotelId, locais, pessoas, agora, ativos, hotel) };
    },
  };
}
