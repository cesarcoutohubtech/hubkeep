// Categorias de ativo (fase 1a, B2; ADR-028). Repete a lista de tipos de campo
// e a de categorias padrão do domínio; tests/contratos-dominio confere. O
// formato fino das definições (chave, rótulos, opções) é validado no domínio,
// que devolve definicao_de_campo_invalida com o campo e o motivo.
import { z } from 'zod';
import { IDIOMAS_API } from './preferencias';

export const TIPOS_DE_CAMPO_API = ['texto', 'numero', 'data', 'lista', 'sim_nao'] as const;
export const CATEGORIAS_PADRAO_API = [
  'refrigeracao',
  'eletrica',
  'hidraulica',
  'elevadores',
  'cozinha',
  'lavanderia',
  'mobiliario',
  'eletronicos',
  'piscina',
  'seguranca',
] as const;

const Rotulos = z.partialRecord(z.enum(IDIOMAS_API), z.string().max(200));

export const DefinicaoDeCampoApi = z
  .object({
    chave: z.string().max(64),
    tipo: z.enum(TIPOS_DE_CAMPO_API),
    obrigatorio: z.boolean(),
    rotulos: Rotulos,
    unidade: z.string().max(32).nullable(),
    opcoes: z.array(z.object({ chave: z.string().max(64), rotulos: Rotulos })).max(100),
  })
  .meta({ id: 'DefinicaoDeCampoApi' });

export const CategoriaApi = z
  .object({
    id: z.guid(),
    /** Categoria padrão do catálogo (nome em categoria_ativo.padrao.<chave>); nulo na do tenant. */
    chavePadrao: z.string().nullable(),
    /** Nomes do tenant por idioma, parciais (ADR-027). */
    nomes: Rotulos,
    campos: z.array(DefinicaoDeCampoApi),
    ativa: z.boolean(),
  })
  .meta({ id: 'CategoriaApi' });

export const RespostaDeCategorias = z
  .object({ idiomaPadrao: z.enum(IDIOMAS_API), categorias: z.array(CategoriaApi) })
  .meta({ id: 'RespostaDeCategorias' });

/** Na entrada, unidade e opções podem faltar; o domínio completa. */
export const PedidoDeCategoria = z
  .object({
    nomes: Rotulos,
    campos: z
      .array(
        DefinicaoDeCampoApi.extend({
          obrigatorio: z.boolean().optional(),
          unidade: z.string().max(32).nullish(),
          opcoes: DefinicaoDeCampoApi.shape.opcoes.optional(),
        }),
      )
      .max(100),
  })
  .meta({ id: 'PedidoDeCategoria' });

export const RespostaDeCategoriaAlterada = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeCategoriaAlterada' });

export const RespostaDeCategoriasPadrao = z
  .object({ instaladas: z.int() })
  .meta({ id: 'RespostaDeCategoriasPadrao' });
