// Equipes do hotel (fase 1a, A6): criar, renomear, desativar, pôr e tirar
// membro. A OS vai poder ser atribuída a uma equipe (C3), e a produtividade por
// equipe da 1c usa isto. Qualquer membro ativo do tenant pode entrar numa
// equipe: quem gerencia (o gerente, por exemplo) não enxerga, pela RLS, os
// papéis dos outros, e a equipe sozinha não dá acesso a nada (a OS é vista pelo
// escopo do hotel). A regra é injetável para o teste provar que a RLS barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  ehTecnicoDoHotel,
  exigir,
  normalizarNomeDeEquipe,
  podeGerirEquipes,
} from '@hubkeep/dominio';
import type { EquipeDoHotel, PortaEquipes } from '../portas/equipes';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

type RegraDeEquipes = (
  minhas: readonly Atribuicao[],
  hotel: { id: string; bandeiraId: string | null },
  agora: Date,
) => Resultado;

export interface CasosDeUsoDeEquipes {
  /**
   * As equipes do hotel, os membros ativos (para pôr numa equipe) e os
   * Técnicos do hotel: os membros ativos com papel de Técnico vigente que
   * cobre o hotel, a lista de quem pode receber a OS (a mesma regra da
   * gravação, ehTecnicoDoHotel). Quem não lê as atribuições de Técnico do
   * hotel pela RLS recebe a lista vazia.
   */
  listarEquipes(
    ctx: Contexto,
    hotelId: string,
  ): Promise<{
    equipes: EquipeDoHotel[];
    disponiveis: { usuarioId: string; nome: string }[];
    tecnicos: { usuarioId: string; nome: string }[];
  }>;
  criarEquipe(ctx: Contexto, hotelId: string, nome: string): Promise<{ id: string }>;
  renomearEquipe(ctx: Contexto, equipeId: string, nome: string): Promise<void>;
  desativarEquipe(ctx: Contexto, equipeId: string): Promise<void>;
  reativarEquipe(ctx: Contexto, equipeId: string): Promise<void>;
  porMembro(ctx: Contexto, equipeId: string, usuarioId: string): Promise<void>;
  tirarMembro(ctx: Contexto, equipeId: string, usuarioId: string): Promise<void>;
}

export function criarCasosDeUsoDeEquipes(deps: {
  equipes: PortaEquipes;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirEquipes do domínio. Só o teste de aceite troca. */
  podeGerir?: RegraDeEquipes;
}): CasosDeUsoDeEquipes {
  const podeGerir = deps.podeGerir ?? podeGerirEquipes;
  const exigirNoHotel = async (ctx: Contexto, hotel: { id: string; bandeiraId: string | null }) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
  const hotelVisivel = async (ctx: Contexto, hotelId: string) => {
    const h = await deps.equipes.hotel(ctx, hotelId);
    if (!h) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    return h;
  };
  const daEquipe = async (ctx: Contexto, equipeId: string) => {
    const h = await deps.equipes.hotelDaEquipe(ctx, equipeId);
    if (!h) throw new NaoEncontrado('equipe_nao_encontrada', 'Equipe não encontrada.');
    await exigirNoHotel(ctx, h);
  };

  return {
    // Quem lê o hotel vê as equipes (RLS); gravar pede o papel de gestão.
    async listarEquipes(ctx, hotelId) {
      const hotel = await hotelVisivel(ctx, hotelId);
      const [lista, atribuicoes] = await Promise.all([
        deps.equipes.listar(ctx, hotelId),
        deps.equipes.atribuicoesDeTecnico(ctx),
      ]);
      const agora = deps.relogio.agora();
      const tecnicos = lista.disponiveis.filter((m) =>
        ehTecnicoDoHotel(atribuicoes, m.usuarioId, hotel, agora),
      );
      return { ...lista, tecnicos };
    },
    async criarEquipe(ctx, hotelId, nome) {
      await exigirNoHotel(ctx, await hotelVisivel(ctx, hotelId));
      return deps.equipes.criar(ctx, hotelId, normalizarNomeDeEquipe(nome));
    },
    async renomearEquipe(ctx, equipeId, nome) {
      await daEquipe(ctx, equipeId);
      await deps.equipes.renomear(ctx, equipeId, normalizarNomeDeEquipe(nome));
    },
    async desativarEquipe(ctx, equipeId) {
      await daEquipe(ctx, equipeId);
      await deps.equipes.definirAtiva(ctx, equipeId, false);
    },
    async reativarEquipe(ctx, equipeId) {
      await daEquipe(ctx, equipeId);
      await deps.equipes.definirAtiva(ctx, equipeId, true);
    },
    async porMembro(ctx, equipeId, usuarioId) {
      await daEquipe(ctx, equipeId);
      await deps.equipes.definirMembro(ctx, equipeId, usuarioId, true);
    },
    async tirarMembro(ctx, equipeId, usuarioId) {
      await daEquipe(ctx, equipeId);
      await deps.equipes.definirMembro(ctx, equipeId, usuarioId, false);
    },
  };
}
