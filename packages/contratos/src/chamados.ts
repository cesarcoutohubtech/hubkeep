// Chamados (fase 1a, C2). A abertura leva o local, o ativo opcional e a
// descrição; a prioridade padrão e a situação inicial são resolvidas no
// servidor, e a foto vai depois, como anexo do chamado. Os limites finos
// (descrição, ativo no local, UH pendente) são validados no domínio, com código.
import { z } from 'zod';
import { ESTADOS_DO_CHAMADO_API } from './situacoes';

export const PedidoDeAberturaDeChamado = z
  .object({
    localId: z.guid(),
    ativoId: z.guid().nullish(),
    descricao: z.string().max(4000),
  })
  .meta({ id: 'PedidoDeAberturaDeChamado' });

export const RespostaDeChamadoAberto = z
  .object({ id: z.guid(), versao: z.int() })
  .meta({ id: 'RespostaDeChamadoAberto' });

export const ChamadoApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    localId: z.guid(),
    ativoId: z.guid().nullable(),
    descricao: z.string(),
    estado: z.enum(ESTADOS_DO_CHAMADO_API),
    situacaoId: z.guid(),
    prioridadeId: z.guid(),
    /** Cópia da política aplicada na abertura (ADR-026), por chave. */
    politicaAplicada: z.record(z.string(), z.unknown()),
    abertoPor: z.guid(),
    versao: z.int(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'ChamadoApi' });

export const RespostaDeChamado = z
  .object({ chamado: ChamadoApi })
  .meta({ id: 'RespostaDeChamado' });
