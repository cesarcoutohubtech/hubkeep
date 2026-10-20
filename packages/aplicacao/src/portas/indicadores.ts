// Leitura do painel de indicadores (1c, item 8). Só leitura, no contexto do
// usuário: a RLS decide que hotéis, chamados e OS ele lê. A porta devolve as
// linhas cruas; o cálculo é do domínio (indicadores.ts).
import type {
  ApontamentoDoIndicador,
  ChamadoDoIndicador,
  Contexto,
  NiveisDePolitica,
  PeriodoDeUhIndisponivel,
  PreventivaDoIndicador,
} from '@hubkeep/dominio';

export interface HotelDoPainel {
  id: string;
  nome: string;
  fuso: string;
  bandeiraId: string | null;
  bandeiraNome: string | null;
  /** As UHs ativas (`app.local`, tipo 'uh', status 'ativo'). */
  uhsAtivas: number;
  /**
   * O usuário é proprietário do hotel inteiro ou de UHs dele (pelas funções de
   * autorização, que leem os vínculos que a RLS não mostra a ele).
   */
  doUsuarioComoProprietario: boolean;
}

/** O que a consulta lê: os hotéis e o intervalo que cobre o período em todos os fusos. */
export interface JanelaDosIndicadores {
  hotelIds: readonly string[];
  /** O primeiro dia do período, aaaa-mm-dd, para a data prevista da preventiva. */
  diaInicio: string;
  diaFim: string;
  /** O menor começo e o maior fim do período entre os fusos dos hotéis. */
  de: Date;
  ate: Date;
}

/** As linhas de cada hotel, já no formato do domínio. */
export interface DadosDoHotel {
  chamados: ChamadoDoIndicador[];
  preventivas: PreventivaDoIndicador[];
  periodosDeUh: PeriodoDeUhIndisponivel[];
  apontamentos: ApontamentoDoIndicador[];
}

export interface PortaIndicadores {
  /** Os hotéis ativos que o usuário lê, opcionalmente só um, ou só os de uma bandeira. */
  hoteis(
    ctx: Contexto,
    filtro: { hotelId?: string | undefined; bandeiraId?: string | undefined },
  ): Promise<HotelDoPainel[]>;
  /**
   * As linhas que importam para o período: os chamados não cancelados abertos
   * antes do fim e que ainda estavam sem conclusão no começo (ou com o prazo
   * de solução no período), com as OS e as transições; as preventivas com a
   * data prevista no período, concluídas nele ou com apontamento nele; os
   * períodos de UH indisponível e os apontamentos que cruzam o intervalo.
   */
  dados(ctx: Contexto, janela: JanelaDosIndicadores): Promise<Map<string, DadosDoHotel>>;
  /** Os níveis gravados de cada chave, por hotel (a resolução é do domínio). */
  politicas(
    ctx: Contexto,
    hotelIds: readonly string[],
    chaves: readonly string[],
  ): Promise<Map<string, Map<string, NiveisDePolitica>>>;
  /** Os nomes das equipes dos hotéis. */
  equipes(ctx: Contexto, hotelIds: readonly string[]): Promise<{ id: string; nome: string }[]>;
}
