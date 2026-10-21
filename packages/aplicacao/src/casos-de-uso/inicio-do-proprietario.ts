// O cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da paridade): as
// UHs de cada hotel a que o proprietário está ligado por UHs.
import {
  type Contexto,
  exigir,
  hoteisDasUhsAcompanhadas,
  podeVerOInicioDoProprietario,
} from '@hubkeep/dominio';
import type { PortaInicioDoProprietario } from '../portas/inicio-do-proprietario';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface InicioDoProprietario {
  uhsAcompanhadas: { hotelId: string; hotelNome: string; uhs: number }[];
}

export interface CasosDeUsoDoInicioDoProprietario {
  /** Pelo nome do hotel; 403 para quem não é proprietário. */
  consultar(ctx: Contexto): Promise<InicioDoProprietario>;
}

export function criarCasosDeUsoDoInicioDoProprietario(deps: {
  inicio: PortaInicioDoProprietario;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
}): CasosDeUsoDoInicioDoProprietario {
  return {
    async consultar(ctx) {
      exigir(
        podeVerOInicioDoProprietario(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()),
      );
      return {
        uhsAcompanhadas: hoteisDasUhsAcompanhadas(await deps.inicio.vinculos(ctx)).map((v) => ({
          hotelId: v.hotelId,
          hotelNome: v.hotelNome,
          uhs: v.uhs,
        })),
      };
    },
  };
}
