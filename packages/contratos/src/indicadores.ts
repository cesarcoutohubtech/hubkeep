// Painel de indicadores (1c, item 8; glossário único de métricas, versão 3).
// O período é de dias locais (aaaa-mm-dd), contados no fuso de cada hotel.
import { z } from 'zod';

const Dia = z.iso.date();

export const FAIXAS_DE_IDADE_API = [
  'ate_2',
  'de_3_a_7',
  'de_8_a_15',
  'de_16_a_30',
  'mais_de_30',
] as const;

export const ConsultaDosIndicadores = z
  .object({
    /** O primeiro dia do período, inclusive. */
    inicio: Dia,
    /** O último dia do período, inclusive; até 92 dias com o primeiro. */
    fim: Dia,
    hotelId: z.guid().optional(),
    bandeiraId: z.guid().optional(),
  })
  .strict()
  .meta({ id: 'ConsultaDosIndicadores' });

const BacklogPorIdade = z.object(
  Object.fromEntries(FAIXAS_DE_IDADE_API.map((f) => [f, z.int().min(0)])) as Record<
    (typeof FAIXAS_DE_IDADE_API)[number],
    z.ZodInt
  >,
);

const Percentual = z.number().min(0).max(100).nullable();

export const IndicadoresApi = z
  .object({
    backlog: z.int().min(0),
    backlogPorIdade: BacklogPorIdade,
    backlogPor100Uhs: z.number().min(0).nullable(),
    percentualDeSla: Percentual,
    sla: z.object({
      total: z.int().min(0),
      dentroDoPrazo: z.int().min(0),
      aindaNoPrazo: z.int().min(0),
      pausadoSegundos: z.int().min(0),
      pausadoMedioSegundos: z.int().min(0).nullable(),
    }),
    mttrHoras: z.number().min(0).nullable(),
    medianaHoras: z.number().min(0).nullable(),
    corretivasConcluidas: z.int().min(0),
    percentualDePreventivaEmDia: Percentual,
    preventiva: z.object({
      total: z.int().min(0),
      emDia: z.int().min(0),
      atrasadas: z.int().min(0),
      aindaNoPrazo: z.int().min(0),
    }),
    preventivasConcluidas: z.int().min(0),
    preventivasPorCorretiva: z.number().min(0).nullable(),
    percentualDePreventivas: Percentual,
    abertos: z.int().min(0),
    chamadosPor100Uhs: z.number().min(0).nullable(),
    uhDias: z.number().min(0),
    uhsAtivas: z.int().min(0),
    hoteis: z.int().min(0),
  })
  .meta({ id: 'IndicadoresApi' });

const CartoesApi = z.object({
  backlog: z.int().min(0),
  backlogPorIdade: BacklogPorIdade,
  uhDias: z.number().min(0),
  abertos: z.int().min(0),
  chamadosPor100Uhs: z.number().min(0).nullable(),
});

const HotelBase = { id: z.guid(), nome: z.string(), bandeiraId: z.guid().nullable() };

export const RespostaDosIndicadores = z
  .object({
    periodo: z.object({ inicio: Dia, fim: Dia }),
    rede: IndicadoresApi.nullable(),
    metaDeSla: z.int().min(1).max(100),
    hoteis: z.array(
      z.discriminatedUnion('visao', [
        z.object({
          ...HotelBase,
          visao: z.literal('completa'),
          indicadores: IndicadoresApi,
          metaDeSla: z.int().min(1).max(100),
        }),
        z.object({ ...HotelBase, visao: z.literal('cartoes'), cartoes: CartoesApi }),
      ]),
    ),
    bandeiras: z.array(z.object({ id: z.guid(), nome: z.string(), indicadores: IndicadoresApi })),
    serie: z.array(
      z.object({
        dia: Dia,
        backlog: z.int().min(0),
        abertos: z.int().min(0),
        encerrados: z.int().min(0),
        /** Os indicadores do dia, com o dia no lugar do período; null sem item na conta. */
        percentualDeSla: Percentual,
        mttrHoras: z.number().min(0).nullable(),
        percentualDePreventivaEmDia: Percentual,
      }),
    ),
    /** "Onde mais quebra": as categorias com mais chamados abertos no período, e o resto. */
    ondeMaisQuebra: z.object({
      categorias: z
        .array(z.object({ categoriaId: z.guid().nullable(), chamados: z.int().min(1) }))
        .max(8),
      outras: z.int().min(0),
    }),
    produtividade: z.array(
      z.object({
        hotelId: z.guid(),
        equipeId: z.guid().nullable(),
        equipeNome: z.string().nullable(),
        osConcluidas: z.int().min(0),
        segundosApontados: z.int().min(0),
      }),
    ),
  })
  .meta({ id: 'RespostaDosIndicadores' });
