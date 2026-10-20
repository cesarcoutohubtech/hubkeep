// Modelos de ativo por categoria (fase 1b, M1; migração 0050). Os campos são
// os valores pré-preenchidos dos campos estendidos da categoria; a validação
// contra a categoria, o checklist e a periodicidade sugerida é do domínio, que
// devolve o código.
import { z } from 'zod';
import { ValoresDeCampoApi } from './ativos';
import { UNIDADES_DE_PERIODICIDADE_API } from './planos-preventivos';

const Texto = z.string().max(500);

/** A periodicidade sugerida para o plano do ativo que nasce do modelo. */
export const PlanoSugeridoApi = z
  .object({ intervalo: z.int(), unidade: z.enum(UNIDADES_DE_PERIODICIDADE_API) })
  .meta({ id: 'PlanoSugeridoApi' });

export const ModeloDeAtivoApi = z
  .object({
    id: z.guid(),
    categoriaId: z.guid(),
    nome: z.string(),
    fabricante: z.string().nullable(),
    modelo: z.string().nullable(),
    /** Lidos com a definição atual da categoria: o que ela não aceita fica de fora. */
    campos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    checklistModeloId: z.guid().nullable(),
    planoSugerido: PlanoSugeridoApi.nullable(),
    /** Sobe a cada gravação; a alteração leva a versão vista (ADR-029). */
    versao: z.int(),
    ativa: z.boolean(),
    /** PB1b: nulo vale para o grupo inteiro; não muda depois de criado. */
    bandeiraId: z.guid().nullable(),
  })
  .meta({ id: 'ModeloDeAtivoApi' });

export const RespostaDeModelosDeAtivo = z
  .object({ modelos: z.array(ModeloDeAtivoApi) })
  .meta({ id: 'RespostaDeModelosDeAtivo' });

export const PedidoDeModeloDeAtivo = z
  .object({
    categoriaId: z.guid(),
    nome: Texto,
    fabricante: Texto.nullable(),
    modelo: Texto.nullable(),
    campos: ValoresDeCampoApi.optional(),
    checklistModeloId: z.guid().nullable(),
    planoSugerido: z.object({ intervalo: z.number(), unidade: z.string().max(16) }).nullable(),
  })
  .meta({ id: 'PedidoDeModeloDeAtivo' });

/** A bandeira (PB1b) só se escolhe na criação; ausente ou nula: do grupo. */
export const PedidoDeCriacaoDeModeloDeAtivo = PedidoDeModeloDeAtivo.extend({
  bandeiraId: z.guid().nullable().optional(),
}).meta({ id: 'PedidoDeCriacaoDeModeloDeAtivo' });

export const PedidoDeAlteracaoDeModeloDeAtivo = PedidoDeModeloDeAtivo.extend({
  versao: z.int(),
}).meta({ id: 'PedidoDeAlteracaoDeModeloDeAtivo' });

export const PedidoDeVersaoDeModeloDeAtivo = z
  .object({ versao: z.int() })
  .meta({ id: 'PedidoDeVersaoDeModeloDeAtivo' });

export const RespostaDeModeloDeAtivoGravado = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDeModeloDeAtivoGravado' });
