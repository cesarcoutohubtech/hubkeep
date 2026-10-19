// Contagem de envios por destinatário e por dia (1c, C8 do Cesar, 13/10/2026):
// disponível desde o primeiro dia do piloto, para saber quem recebe mais que
// o limite e abrir o resumo agrupado. Quem vê é a gestão (domínio); a RLS
// de app.envio_notificacao mostra só os hotéis de cada um.
import {
  type Contexto,
  LIMITE_DE_ENVIOS_POR_DIA,
  exigir,
  podeVerContagemDeEnvios,
  validarPeriodoDaContagem,
} from '@hubkeep/dominio';
import type { ContagemDeEnvios, PortaComunicacao } from '../portas/comunicacao';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

export interface ContagemNoPeriodo {
  /** O limite por pessoa e por dia (C8). */
  limite: number;
  /**
   * Do dia mais recente para o mais antigo; no mesmo dia, de quem recebeu
   * mais. Uma linha por pessoa, dia e canal; o limite vale em cada canal.
   */
  dias: (ContagemDeEnvios & { acimaDoLimite: boolean })[];
}

export interface CasosDeUsoDeComunicacao {
  contagemDeEnvios(
    ctx: Contexto,
    p: { de: string; ate: string; hotelId?: string | null | undefined },
  ): Promise<ContagemNoPeriodo>;
}

export function criarCasosDeUsoDeComunicacao(deps: {
  comunicacao: Pick<PortaComunicacao, 'contagemPorDia'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  relogio: Relogio;
}): CasosDeUsoDeComunicacao {
  return {
    async contagemDeEnvios(ctx, p) {
      exigir(podeVerContagemDeEnvios(await deps.atribuicoes.doUsuario(ctx), deps.relogio.agora()));
      const de = new Date(p.de);
      const ate = new Date(p.ate);
      validarPeriodoDaContagem(de, ate);
      const linhas = await deps.comunicacao.contagemPorDia(ctx, {
        de,
        ate,
        hotelId: p.hotelId ?? null,
      });
      const dias = [...linhas]
        .sort(
          (a, b) =>
            b.dia.localeCompare(a.dia) ||
            b.envios - a.envios ||
            a.usuarioId.localeCompare(b.usuarioId) ||
            a.canal.localeCompare(b.canal),
        )
        .map((l) => ({ ...l, acimaDoLimite: l.envios > LIMITE_DE_ENVIOS_POR_DIA }));
      return { limite: LIMITE_DE_ENVIOS_POR_DIA, dias };
    },
  };
}
