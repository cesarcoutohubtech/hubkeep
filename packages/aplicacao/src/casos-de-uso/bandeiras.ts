// Bandeiras (fase 1a, A2): criar, renomear, desativar e reativar, e trocar a
// bandeira de um hotel. Trocar a bandeira muda o escopo de quem tem papel na
// bandeira (Gestor CSC) na transação seguinte, porque o escopo é calculado na
// fonte (ADR-004, ADR-011). Só o Admin do grupo; a regra é injetável para o
// teste de aceite provar que a RLS ainda barra.
import {
  type Atribuicao,
  type Contexto,
  NaoEncontrado,
  type Resultado,
  exigir,
  normalizarNomeDeBandeira,
  podeGerirBandeiras,
  podeLigarHotelABandeira,
} from '@hubkeep/dominio';
import type { BandeiraCadastrada, PortaBandeiras } from '../portas/bandeiras';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface CasosDeUsoDeBandeiras {
  listarBandeiras(ctx: Contexto): Promise<BandeiraCadastrada[]>;
  criarBandeira(ctx: Contexto, nome: string): Promise<{ id: string }>;
  renomearBandeira(ctx: Contexto, id: string, nome: string): Promise<void>;
  desativarBandeira(ctx: Contexto, id: string): Promise<void>;
  reativarBandeira(ctx: Contexto, id: string): Promise<void>;
  definirBandeiraDoHotel(ctx: Contexto, hotelId: string, bandeiraId: string | null): Promise<void>;
}

export function criarCasosDeUsoDeBandeiras(deps: {
  bandeiras: PortaBandeiras;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
  /** Padrão: podeGerirBandeiras do domínio. Só o teste de aceite troca. */
  podeGerir?: (minhas: readonly Atribuicao[], agora: Date) => Resultado;
}): CasosDeUsoDeBandeiras {
  const podeGerir = deps.podeGerir ?? podeGerirBandeiras;
  const exigirAdmin = async (ctx: Contexto) =>
    exigir(podeGerir(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
  const existente = async (ctx: Contexto, id: string) => {
    const b = await deps.bandeiras.buscar(ctx, id);
    if (!b) throw new NaoEncontrado('bandeira_nao_encontrada', 'Bandeira não encontrada.');
    return b;
  };

  return {
    // Qualquer membro vê as bandeiras do tenant (a RLS decide); gravar é do Admin.
    listarBandeiras: (ctx) => deps.bandeiras.listar(ctx),

    async criarBandeira(ctx, nome) {
      await exigirAdmin(ctx);
      return deps.bandeiras.criar(ctx, normalizarNomeDeBandeira(nome));
    },

    async renomearBandeira(ctx, id, nome) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.bandeiras.renomear(ctx, id, normalizarNomeDeBandeira(nome));
    },

    async desativarBandeira(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.bandeiras.definirAtiva(ctx, id, false);
    },

    async reativarBandeira(ctx, id) {
      await exigirAdmin(ctx);
      await existente(ctx, id);
      await deps.bandeiras.definirAtiva(ctx, id, true);
    },

    async definirBandeiraDoHotel(ctx, hotelId, bandeiraId) {
      await exigirAdmin(ctx);
      const bandeira = bandeiraId ? await existente(ctx, bandeiraId) : null;
      exigir(podeLigarHotelABandeira(bandeira));
      await deps.bandeiras.definirBandeiraDoHotel(ctx, hotelId, bandeiraId);
    },
  };
}
