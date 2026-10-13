// Planos preventivos (fase 1b, PV2; ADR-041). As listas repetem as do domínio
// (UNIDADES_DE_PERIODICIDADE, SITUACOES_DO_PLANO e ACOES_DO_PLANO), conferidas
// por tests/contratos-dominio.test.ts. Os limites da periodicidade, o nome e
// o início são validados no domínio, que devolve o código.
import { z } from 'zod';

export const UNIDADES_DE_PERIODICIDADE_API = ['dia', 'semana', 'mes'] as const;
export const SITUACOES_DO_PLANO_API = ['ativo', 'pausado', 'encerrado'] as const;
export const ACOES_DO_PLANO_API = ['ativar', 'pausar', 'encerrar'] as const;

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PlanoPreventivoApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    /** O alvo: o ativo ou a categoria, exatamente um. */
    ativoId: z.guid().nullable(),
    categoriaId: z.guid().nullable(),
    nome: z.string(),
    intervalo: z.int(),
    unidade: z.enum(UNIDADES_DE_PERIODICIDADE_API),
    /** A primeira data prevista (aaaa-mm-dd), no fuso do hotel. */
    inicio: Data,
    checklistModeloId: z.guid().nullable(),
    /** O responsável padrão: o técnico ou a equipe, no máximo um. */
    tecnicoId: z.guid().nullable(),
    equipeId: z.guid().nullable(),
    situacao: z.enum(SITUACOES_DO_PLANO_API),
    versao: z.int(),
    /** A próxima data prevista a partir de hoje no fuso do hotel; null no encerrado. */
    proximaData: Data.nullable(),
  })
  .meta({ id: 'PlanoPreventivoApi' });

export const RespostaDePlanosPreventivos = z
  .object({
    /** Hoje no fuso do hotel (aaaa-mm-dd). */
    hoje: Data,
    planos: z.array(PlanoPreventivoApi),
  })
  .meta({ id: 'RespostaDePlanosPreventivos' });

const DadosDoPlanoApi = z.object({
  nome: z.string().max(200),
  intervalo: z.int(),
  unidade: z.string().max(16),
  inicio: z.string().max(10),
  checklistModeloId: z.guid().nullable(),
  tecnicoId: z.guid().nullable(),
  equipeId: z.guid().nullable(),
});

export const PedidoDeNovoPlanoPreventivo = DadosDoPlanoApi.extend({
  ativoId: z.guid().nullable(),
  categoriaId: z.guid().nullable(),
  /** true: nasce ativo (precisa do responsável); false: nasce pausado. */
  ativar: z.boolean(),
}).meta({ id: 'PedidoDeNovoPlanoPreventivo' });

export const PedidoDeAlteracaoDePlanoPreventivo = DadosDoPlanoApi.extend({
  /** A versão lida (ADR-029). */
  versao: z.int(),
}).meta({ id: 'PedidoDeAlteracaoDePlanoPreventivo' });

export const PedidoDeSituacaoDoPlano = z
  .object({ versao: z.int() })
  .meta({ id: 'PedidoDeSituacaoDoPlano' });

export const RespostaDePlanoAlterado = z
  .object({
    id: z.guid(),
    versao: z.int(),
    situacao: z.enum(SITUACOES_DO_PLANO_API).optional(),
  })
  .meta({ id: 'RespostaDePlanoAlterado' });
