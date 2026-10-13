// Feriados do hotel (fase 1c; ADR-042): listar, cadastrar, alterar o nome e a
// marca "repete todo ano", desativar e reativar. Quem lê o hotel vê os
// feriados (a abertura do chamado calcula o prazo com eles); cadastrar e
// alterar pedem a gestão do hotel ou o Implantador. A regra é injetável para o
// teste provar que a RLS barra sozinha.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  exigir,
  normalizarNomeDoFeriado,
  podeCadastrarFeriados,
  validarDataDoFeriado,
} from '@hubkeep/dominio';
import type { FeriadoDoHotelGravado, PortaFeriadosDoHotel } from '../portas/feriados-do-hotel';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

type RegraDosFeriados = (
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
) => Resultado;

export interface PedidoDeFeriado {
  data: string;
  nome: string;
  anual?: boolean | undefined;
}

export interface CasosDeUsoDeFeriados {
  /** Os feriados do hotel e se quem pede pode cadastrar (a tela esconde os botões). */
  listar(
    ctx: Contexto,
    hotelId: string,
  ): Promise<{ feriados: FeriadoDoHotelGravado[]; podeCadastrar: boolean }>;
  criar(ctx: Contexto, hotelId: string, pedido: PedidoDeFeriado): Promise<{ id: string }>;
  alterar(
    ctx: Contexto,
    feriadoId: string,
    mudanca: { nome?: string | undefined; anual?: boolean | undefined },
  ): Promise<void>;
  desativar(ctx: Contexto, feriadoId: string): Promise<void>;
  reativar(ctx: Contexto, feriadoId: string): Promise<void>;
}

export function criarCasosDeUsoDeFeriados(deps: {
  feriados: PortaFeriadosDoHotel;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeCadastrarFeriados do domínio. Só o teste de aceite troca. */
  podeCadastrar?: RegraDosFeriados;
}): CasosDeUsoDeFeriados {
  const regra = deps.podeCadastrar ?? podeCadastrarFeriados;
  const resultado = async (ctx: Contexto, hotel: { id: string; bandeiraId: string | null }) =>
    regra(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora());
  const hotelVisivel = async (ctx: Contexto, hotelId: string) => {
    const h = await deps.feriados.hotel(ctx, hotelId);
    if (!h) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    return h;
  };
  const doFeriado = async (ctx: Contexto, feriadoId: string) => {
    const f = await deps.feriados.feriado(ctx, feriadoId);
    if (!f) throw new NaoEncontrado('feriado_nao_encontrado', 'Feriado não encontrado.');
    exigir(await resultado(ctx, { id: f.feriado.hotelId, bandeiraId: f.bandeiraId }));
    return f.feriado;
  };

  return {
    async listar(ctx, hotelId) {
      const hotel = await hotelVisivel(ctx, hotelId);
      const [feriados, pode] = await Promise.all([
        deps.feriados.listar(ctx, hotelId),
        resultado(ctx, hotel),
      ]);
      return { feriados, podeCadastrar: pode.permitido };
    },
    async criar(ctx, hotelId, pedido) {
      exigir(await resultado(ctx, await hotelVisivel(ctx, hotelId)));
      return deps.feriados.criar(ctx, hotelId, {
        data: validarDataDoFeriado(pedido.data),
        nome: normalizarNomeDoFeriado(pedido.nome),
        anual: pedido.anual ?? false,
      });
    },
    async alterar(ctx, feriadoId, mudanca) {
      await doFeriado(ctx, feriadoId);
      await deps.feriados.alterar(ctx, feriadoId, {
        ...(mudanca.nome !== undefined ? { nome: normalizarNomeDoFeriado(mudanca.nome) } : {}),
        ...(mudanca.anual !== undefined ? { anual: mudanca.anual } : {}),
      });
    },
    async desativar(ctx, feriadoId) {
      await doFeriado(ctx, feriadoId);
      await deps.feriados.alterar(ctx, feriadoId, { ativo: false });
    },
    async reativar(ctx, feriadoId) {
      await doFeriado(ctx, feriadoId);
      await deps.feriados.alterar(ctx, feriadoId, { ativo: true });
    },
  };
}
