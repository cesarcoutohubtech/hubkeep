// Painel de indicadores (1c, item 8; glossário único de métricas, versão 3).
// Cálculo na leitura, sem tabela de agregados (decisão 9). O escopo é o da RLS;
// de cada hotel lido, o domínio diz o que a pessoa vê: a gestão vê tudo e o
// proprietário só os cartões (backlog, UH-dias e chamados). A rede, as
// bandeiras, a série e a produtividade somam só os hotéis da visão completa.
import {
  type Contexto,
  type DiaDaSerie,
  type FaixaDeIdade,
  type Indicadores,
  type ParcialDeIndicadores,
  type PeriodoDoPainel,
  type ProdutividadeDaEquipe,
  type VisaoDoHotel,
  exigir,
  indicadoresDaParcial,
  intervaloNoFuso,
  parcialDoHotel,
  podeVerIndicadores,
  resolverPolitica,
  somarParciais,
  validarPeriodoDoPainel,
  visaoDoHotel,
} from '@hubkeep/dominio';
import type { HotelDoPainel, PortaIndicadores } from '../portas/indicadores';
import type { PortaAtribuicoes, Relogio } from '../portas/papeis';

const TOLERANCIA = 'preventiva.tolerancia_dias';
const SLA = 'chamado.sla';

/** O que o proprietário vê de um hotel. */
export interface CartoesDoHotel {
  backlog: number;
  backlogPorIdade: Record<FaixaDeIdade, number>;
  uhDias: number;
  abertos: number;
  chamadosPor100Uhs: number | null;
}

export type IndicadoresDoHotel = {
  id: string;
  nome: string;
  bandeiraId: string | null;
} & (
  | { visao: Extract<VisaoDoHotel, 'completa'>; indicadores: Indicadores; metaDeSla: number }
  | { visao: Extract<VisaoDoHotel, 'cartoes'>; cartoes: CartoesDoHotel }
);

export interface IndicadoresDaBandeira {
  id: string;
  nome: string;
  indicadores: Indicadores;
}

export interface PainelDeIndicadores {
  periodo: PeriodoDoPainel;
  /** Os hotéis da visão completa somados; null sem nenhum. */
  rede: Indicadores | null;
  /** A meta de SLA do grupo (os hotéis podem ter a própria, em cada linha). */
  metaDeSla: number;
  hoteis: IndicadoresDoHotel[];
  /** A comparação na bandeira: cada bandeira com hotel na visão completa. */
  bandeiras: IndicadoresDaBandeira[];
  serie: DiaDaSerie[];
  produtividade: (ProdutividadeDaEquipe & { equipeNome: string | null })[];
}

export interface FiltroDosIndicadores {
  periodo: PeriodoDoPainel;
  hotelId?: string | undefined;
  bandeiraId?: string | undefined;
}

export interface CasosDeUsoDeIndicadores {
  consultar(ctx: Contexto, filtro: FiltroDosIndicadores): Promise<PainelDeIndicadores>;
}

const cartoes = (i: Indicadores): CartoesDoHotel => ({
  backlog: i.backlog,
  backlogPorIdade: i.backlogPorIdade,
  uhDias: i.uhDias,
  abertos: i.abertos,
  chamadosPor100Uhs: i.chamadosPor100Uhs,
});

export function criarCasosDeUsoDeIndicadores(deps: {
  indicadores: PortaIndicadores;
  atribuicoes: PortaAtribuicoes;
  relogio: Relogio;
}): CasosDeUsoDeIndicadores {
  return {
    async consultar(ctx, filtro) {
      const agora = deps.relogio.agora();
      const minhas = await deps.atribuicoes.doUsuario(ctx);
      exigir(podeVerIndicadores(minhas, agora));
      validarPeriodoDoPainel(filtro.periodo);

      const lidos = await deps.indicadores.hoteis(ctx, {
        hotelId: filtro.hotelId,
        bandeiraId: filtro.bandeiraId,
      });
      const hoteis = lidos.flatMap((h) => {
        const visao = visaoDoHotel(minhas, h, agora);
        return visao ? [{ hotel: h, visao }] : [];
      });
      const vazio: PainelDeIndicadores = {
        periodo: filtro.periodo,
        rede: null,
        metaDeSla: resolverPolitica(SLA, {}).metaPercentual,
        hoteis: [],
        bandeiras: [],
        serie: [],
        produtividade: [],
      };
      if (hoteis.length === 0) return vazio;

      const ids = hoteis.map((h) => h.hotel.id);
      const intervalos = hoteis.map((h) => intervaloNoFuso(filtro.periodo, h.hotel.fuso));
      const [dados, politicas, equipes] = await Promise.all([
        deps.indicadores.dados(ctx, {
          hotelIds: ids,
          diaInicio: filtro.periodo.inicio,
          diaFim: filtro.periodo.fim,
          de: new Date(Math.min(...intervalos.map((i) => i.de.getTime()))),
          ate: new Date(Math.max(...intervalos.map((i) => i.ate.getTime()))),
        }),
        deps.indicadores.politicas(ctx, ids, [TOLERANCIA, SLA]),
        deps.indicadores.equipes(ctx, ids),
      ]);

      const niveis = (hotelId: string, chave: string) => politicas.get(hotelId)?.get(chave) ?? {};
      const parcial = (h: HotelDoPainel): ParcialDeIndicadores => {
        const d = dados.get(h.id);
        return parcialDoHotel(
          {
            hotelId: h.id,
            fuso: h.fuso,
            uhsAtivas: h.uhsAtivas,
            toleranciaDias: resolverPolitica(TOLERANCIA, niveis(h.id, TOLERANCIA)).dias,
            chamados: d?.chamados ?? [],
            preventivas: d?.preventivas ?? [],
            periodosDeUh: d?.periodosDeUh ?? [],
            apontamentos: d?.apontamentos ?? [],
          },
          filtro.periodo,
          agora,
        );
      };

      const completas: { hotel: HotelDoPainel; parcial: ParcialDeIndicadores }[] = [];
      const linhas: IndicadoresDoHotel[] = hoteis.map(({ hotel, visao }) => {
        const p = parcial(hotel);
        const base = { id: hotel.id, nome: hotel.nome, bandeiraId: hotel.bandeiraId };
        if (visao === 'cartoes') {
          return { ...base, visao, cartoes: cartoes(indicadoresDaParcial(p)) };
        }
        completas.push({ hotel, parcial: p });
        return {
          ...base,
          visao,
          indicadores: indicadoresDaParcial(p),
          metaDeSla: resolverPolitica(SLA, niveis(hotel.id, SLA)).metaPercentual,
        };
      });
      if (completas.length === 0) return { ...vazio, hoteis: linhas };

      const porBandeira = new Map<string, { nome: string; parciais: ParcialDeIndicadores[] }>();
      for (const { hotel, parcial: p } of completas) {
        if (!hotel.bandeiraId) continue;
        const b = porBandeira.get(hotel.bandeiraId) ?? {
          nome: hotel.bandeiraNome ?? '',
          parciais: [],
        };
        b.parciais.push(p);
        porBandeira.set(hotel.bandeiraId, b);
      }
      const rede = somarParciais(completas.map((c) => c.parcial));
      const nomeDaEquipe = new Map(equipes.map((e) => [e.id, e.nome]));
      const grupo = politicas.get(ids[0] as string)?.get(SLA)?.grupo;

      return {
        periodo: filtro.periodo,
        rede: indicadoresDaParcial(rede),
        metaDeSla: resolverPolitica(SLA, grupo === undefined ? {} : { grupo }).metaPercentual,
        hoteis: linhas,
        bandeiras: [...porBandeira.entries()]
          .map(([id, b]) => ({
            id,
            nome: b.nome,
            indicadores: indicadoresDaParcial(somarParciais(b.parciais)),
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
        serie: rede.serie,
        produtividade: rede.produtividade.map((p) => ({
          ...p,
          equipeNome: p.equipeId === null ? null : (nomeDaEquipe.get(p.equipeId) ?? null),
        })),
      };
    },
  };
}
