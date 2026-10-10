// Códigos de falha, causa e solução (fase 1b, I6). Repete a lista de tipos do
// domínio; tests/contratos-dominio confere. O nome fino (limite, idiomas) é
// validado no domínio, que devolve codigo_nome_invalido.
import { z } from 'zod';
import { IDIOMAS_API } from './preferencias';

export const TIPOS_DE_CODIGO_DE_MANUTENCAO_API = ['falha', 'causa', 'solucao'] as const;

const Rotulos = z.partialRecord(z.enum(IDIOMAS_API), z.string().max(200));

export const CodigoDeManutencaoApi = z
  .object({
    id: z.guid(),
    tipo: z.enum(TIPOS_DE_CODIGO_DE_MANUTENCAO_API),
    /** A categoria de ativo a que o código serve; nula: todas. */
    categoriaId: z.guid().nullable(),
    /** Código padrão do catálogo (nome em codigo_manutencao.padrao.<chave>); nulo no do tenant. */
    chavePadrao: z.string().nullable(),
    /** Nomes do tenant por idioma, parciais (ADR-027). */
    nomes: Rotulos,
    ativa: z.boolean(),
  })
  .meta({ id: 'CodigoDeManutencaoApi' });

/** Todos os códigos do tenant, inclusive os desativados (a OS antiga mostra o nome). */
export const RespostaDeCodigosDeManutencao = z
  .object({ idiomaPadrao: z.enum(IDIOMAS_API), codigos: z.array(CodigoDeManutencaoApi) })
  .meta({ id: 'RespostaDeCodigosDeManutencao' });

/** O tipo e a categoria não mudam depois de criado: para mudar, cria-se outro. */
export const PedidoDeCodigoDeManutencao = z
  .object({
    tipo: z.enum(TIPOS_DE_CODIGO_DE_MANUTENCAO_API),
    categoriaId: z.guid().nullable(),
    nomes: Rotulos,
  })
  .meta({ id: 'PedidoDeCodigoDeManutencao' });

export const PedidoDeNomesDeCodigo = z
  .object({ nomes: Rotulos })
  .meta({ id: 'PedidoDeNomesDeCodigo' });

export const RespostaDeCodigoAlterado = z
  .object({ id: z.guid() })
  .meta({ id: 'RespostaDeCodigoAlterado' });

export const RespostaDeCodigosPadrao = z
  .object({ instalados: z.int() })
  .meta({ id: 'RespostaDeCodigosPadrao' });

/**
 * Os códigos que servem para a OS, por tipo (ativos, da categoria do ativo do
 * chamado primeiro, depois os de todas): a lista do aceite. Os nomes vêm da
 * lista do tenant.
 */
export const RespostaDeCodigosDaOs = z
  .object({
    falha: z.array(z.guid()),
    causa: z.array(z.guid()),
    solucao: z.array(z.guid()),
  })
  .meta({ id: 'RespostaDeCodigosDaOs' });

/** Os três códigos da OS; null em cada um: não informado. */
export const CodigosDaOsApi = z
  .object({
    falhaId: z.guid().nullable(),
    causaId: z.guid().nullable(),
    solucaoId: z.guid().nullable(),
  })
  .meta({ id: 'CodigosDaOsApi' });
