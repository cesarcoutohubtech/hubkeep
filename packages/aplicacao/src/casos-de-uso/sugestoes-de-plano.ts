// Sugestões de plano preventivo (fase 1b, M1, caminho C; decisão do Cesar de
// 15/10/2026): a gestão do hotel vê os ativos com modelo e sem plano que os
// cubra, cria o plano com um clique (pausado, sem responsável, pelo hk_app e
// com autor) ou descarta com motivo. Quem pode é quem gere planos
// (podeGerirPlanos); a RLS decide por último. O plano nasce pelo caso de uso
// dos planos, com as mesmas validações.
import {
  type Atribuicao,
  type Contexto,
  type Periodicidade,
  NaoEncontrado,
  RegraViolada,
  type Resultado,
  ativoSemPlanoComModelo,
  diaNoFuso,
  exigir,
  exigirPeriodicidadeSugerida,
  lerPlanoSugerido,
  nomeDoPlanoSugerido,
  normalizarMotivo,
  podeGerirPlanos,
} from '@hubkeep/dominio';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaPlanosPreventivos } from '../portas/planos-preventivos';
import type { AtivoComSugestao, PortaSugestoesDePlano } from '../portas/sugestoes-de-plano';
import type { CasosDeUsoDePlanosPreventivos } from './planos-preventivos';

export interface SugestaoDePlano {
  ativoId: string;
  ativoNome: string;
  /** A versão do ativo, que o descarte leva (ADR-029). */
  ativoVersao: number;
  modeloId: string;
  /** null: o modelo não está visível. */
  modeloNome: string | null;
  /** null: o modelo não sugere periodicidade, e não há plano de um clique. */
  periodicidade: Periodicidade | null;
  /** O checklist do modelo, só se ainda ativo. */
  checklistModeloId: string | null;
}

export interface CasosDeUsoDeSugestoesDePlano {
  listar(ctx: Contexto, hotelId: string): Promise<{ sugestoes: SugestaoDePlano[] }>;
  criarPlano(ctx: Contexto, ativoId: string): Promise<{ id: string; versao: number }>;
  descartar(
    ctx: Contexto,
    ativoId: string,
    versao: number,
    motivo: string | null,
  ): Promise<{ versao: number }>;
}

export function criarCasosDeUsoDeSugestoesDePlano(deps: {
  sugestoes: PortaSugestoesDePlano;
  planos: Pick<PortaPlanosPreventivos, 'hotel' | 'doHotel'>;
  criarPlano: CasosDeUsoDePlanosPreventivos['criar'];
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
  /** Padrão: podeGerirPlanos do domínio. Só o teste de aceite troca. */
  podeGerir?: (
    minhas: readonly Atribuicao[],
    hotel: { id: string; bandeiraId: string | null },
    agora: Date,
  ) => Resultado;
}): CasosDeUsoDeSugestoesDePlano {
  const podeGerir = deps.podeGerir ?? podeGerirPlanos;

  const hotelGerido = async (ctx: Contexto, hotelId: string) => {
    const hotel = await deps.planos.hotel(ctx, hotelId);
    if (!hotel) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), hotel, deps.relogio.agora()));
    return hotel;
  };
  /** O ativo, no hotel gerido por quem pede, e ainda na lista de sugestões. */
  const ativoNaLista = async (ctx: Contexto, ativoId: string) => {
    const ativo = await deps.sugestoes.ativo(ctx, ativoId);
    if (!ativo) throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
    const hotel = await hotelGerido(ctx, ativo.hotelId);
    if (!ativoSemPlanoComModelo(ativo, await deps.planos.doHotel(ctx, hotel.id))) {
      throw new RegraViolada(
        'sugestao_de_plano_indisponivel',
        'O ativo já tem plano, não tem modelo ou a sugestão foi descartada.',
      );
    }
    return { ativo, hotel };
  };
  const paraSugestoes = async (
    ctx: Contexto,
    ativos: readonly AtivoComSugestao[],
  ): Promise<SugestaoDePlano[]> => {
    const ids = [...new Set(ativos.flatMap((a) => (a.modeloId ? [a.modeloId] : [])))];
    const modelos = ids.length === 0 ? [] : await deps.sugestoes.modelos(ctx, ids);
    return ativos.flatMap((a) => {
      if (a.modeloId === null) return [];
      const m = modelos.find((x) => x.id === a.modeloId);
      return [
        {
          ativoId: a.id,
          ativoNome: a.nome,
          ativoVersao: a.versao,
          modeloId: a.modeloId,
          modeloNome: m?.nome ?? null,
          periodicidade: m ? lerPlanoSugerido(m.planoSugerido) : null,
          checklistModeloId: m?.checklistAtivo ? m.checklistModeloId : null,
        },
      ];
    });
  };

  return {
    async listar(ctx, hotelId) {
      await hotelGerido(ctx, hotelId);
      const [ativos, planos] = await Promise.all([
        deps.sugestoes.ativos(ctx, hotelId),
        deps.planos.doHotel(ctx, hotelId),
      ]);
      const candidatos = ativos.filter((a) => ativoSemPlanoComModelo(a, planos));
      return { sugestoes: await paraSugestoes(ctx, candidatos) };
    },

    async criarPlano(ctx, ativoId) {
      const { ativo, hotel } = await ativoNaLista(ctx, ativoId);
      const [s] = await paraSugestoes(ctx, [ativo]);
      const periodicidade = exigirPeriodicidadeSugerida(s?.periodicidade ?? null);
      return deps.criarPlano(ctx, hotel.id, {
        nome: nomeDoPlanoSugerido(ativo.nome),
        ...periodicidade,
        inicio: diaNoFuso(deps.relogio.agora(), hotel.fuso),
        checklistModeloId: s?.checklistModeloId ?? null,
        tecnicoId: null,
        equipeId: null,
        ativoId: ativo.id,
        categoriaId: null,
        ativar: false,
      });
    },

    async descartar(ctx, ativoId, versao, motivo) {
      await ativoNaLista(ctx, ativoId);
      return deps.sugestoes.descartar(ctx, ativoId, versao, normalizarMotivo(motivo));
    },
  };
}
