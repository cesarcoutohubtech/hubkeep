// A situação por hotel da tela inicial (1c, seção 4 da paridade; glossário de
// métricas, versão 4): para cada hotel de que quem pede é da gestão, os
// chamados que vencem em breve, os fora do prazo, os críticos, as preventivas
// atrasadas, os abertos por dia nos últimos 14 dias e a situação. O backlog e o
// % de SLA dos 30 dias vêm do painel de indicadores, que a tela já lê.
import {
  type Contexto,
  SITUACOES_DO_HOTEL,
  type SituacaoDoHotel,
  abertosPorDia,
  avisosEmAberto,
  contarChamadosDoHotel,
  contarPreventivasAtrasadas,
  diaNoFuso,
  diasDosAbertosDoQuadro,
  exigir,
  inicioDoDiaLocal,
  podeVerASituacaoPorHotel,
  podeVerAvisosDeSla,
  prioridadesCriticas,
  resolverPolitica,
  situacaoDoHotel,
} from '@hubkeep/dominio';
import type { PortaAvisosDeSla } from '../portas/avisos-de-sla';
import type { PortaIndicadores } from '../portas/indicadores';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';
import type { PortaSituacaoPorHotel } from '../portas/situacao-por-hotel';
import type { PortaPrioridades } from '../portas/situacoes';
import { relogioParadoDoChamado } from './avisos-de-sla';

const TOLERANCIA = 'preventiva.tolerancia_dias';

export interface SituacaoDeUmHotel {
  hotelId: string;
  hotelNome: string;
  situacao: SituacaoDoHotel;
  vencemEmBreve: number;
  foraDoPrazo: number;
  criticos: number;
  preventivasAtrasadas: number;
  /** Os chamados abertos em cada um dos últimos 14 dias locais, o último é hoje. */
  abertosPorDia: number[];
}

export interface CasosDeUsoDaSituacaoPorHotel {
  /** Do hotel mais grave ao mais leve, e pelo nome; 403 para quem não é da gestão. */
  consultar(ctx: Contexto): Promise<{ hoteis: SituacaoDeUmHotel[] }>;
}

export function criarCasosDeUsoDaSituacaoPorHotel(deps: {
  situacao: PortaSituacaoPorHotel;
  avisos: Pick<PortaAvisosDeSla, 'chamadosEmCurso'>;
  indicadores: Pick<PortaIndicadores, 'hoteis' | 'politicas'>;
  atribuicoes: Pick<PortaAtribuicoes, 'doUsuario'>;
  prioridades: Pick<PortaPrioridades, 'listar'>;
  relogio: Relogio;
}): CasosDeUsoDaSituacaoPorHotel {
  return {
    async consultar(ctx) {
      const agora = deps.relogio.agora();
      const minhas = await deps.atribuicoes.doUsuario(ctx);
      exigir(podeVerASituacaoPorHotel(minhas, agora));
      // A RLS mostra também os hotéis de outros papéis (o técnico, o
      // proprietário): ficam só os de que quem pede é da gestão.
      const hoteis = (await deps.indicadores.hoteis(ctx, {})).filter(
        (h) => podeVerAvisosDeSla(minhas, { id: h.id, bandeiraId: h.bandeiraId }, agora).permitido,
      );
      if (hoteis.length === 0) return { hoteis: [] };

      const ids = hoteis.map((h) => h.id);
      const dias = new Map(hoteis.map((h) => [h.id, diasDosAbertosDoQuadro(agora, h.fuso)]));
      const ateDia = hoteis
        .map((h) => diaNoFuso(agora, h.fuso))
        .sort()
        .at(-1) as string;
      const desde = new Date(
        Math.min(
          ...hoteis.map((h) => inicioDoDiaLocal(dias.get(h.id)?.[0] ?? '', h.fuso).getTime()),
        ),
      );
      const [chamados, prioridades, politicas, preventivas, aberturas] = await Promise.all([
        deps.avisos.chamadosEmCurso(ctx),
        deps.prioridades.listar(ctx),
        deps.indicadores.politicas(ctx, ids, [TOLERANCIA]),
        deps.situacao.preventivasAbertas(ctx, ids, ateDia),
        deps.situacao.aberturas(ctx, ids, desde),
      ]);
      const criticas = prioridadesCriticas(prioridades);

      const linhas = hoteis.map((h): SituacaoDeUmHotel => {
        const doHotel = chamados
          .filter((c) => c.hotelId === h.id)
          .map((c) => ({
            prioridadeId: c.prioridadeId,
            avisos: avisosEmAberto({
              chamado: { ...c, relogioParado: relogioParadoDoChamado(c, prioridades) },
              gravados: c.gravados,
              agora,
            }),
          }));
        const contagem = {
          ...contarChamadosDoHotel(doHotel, criticas),
          preventivasAtrasadas: contarPreventivasAtrasadas(
            preventivas.filter((p) => p.hotelId === h.id),
            {
              fuso: h.fuso,
              agora,
              toleranciaDias: resolverPolitica(
                TOLERANCIA,
                politicas.get(h.id)?.get(TOLERANCIA) ?? {},
              ).dias,
            },
          ),
        };
        return {
          hotelId: h.id,
          hotelNome: h.nome,
          situacao: situacaoDoHotel(contagem),
          vencemEmBreve: contagem.vencemEmBreve,
          foraDoPrazo: contagem.foraDoPrazo,
          criticos: contagem.criticos,
          preventivasAtrasadas: contagem.preventivasAtrasadas,
          abertosPorDia: abertosPorDia(
            aberturas.filter((a) => a.hotelId === h.id).map((a) => a.abertoEm),
            dias.get(h.id) ?? [],
            h.fuso,
          ),
        };
      });
      linhas.sort(
        (a, b) =>
          SITUACOES_DO_HOTEL.indexOf(a.situacao) - SITUACOES_DO_HOTEL.indexOf(b.situacao) ||
          a.hotelNome.localeCompare(b.hotelNome) ||
          a.hotelId.localeCompare(b.hotelId),
      );
      return { hoteis: linhas };
    },
  };
}
