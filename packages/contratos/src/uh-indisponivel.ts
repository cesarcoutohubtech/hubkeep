// UH indisponível (fase 1b, I4): os períodos do chamado, com o tempo
// indisponível calculado no domínio; a marcação depois da abertura e a
// liberação, pela gestão do hotel. Na abertura, o período vai com o chamado
// (uhIndisponivelDesde); na conclusão da OS, a liberação vai na operação
// offline (os.concluir, uhLiberada).
import { z } from 'zod';

/**
 * O proprietário recebe só a UH, o estado (aberto: fim null) e as datas;
 * chamadoId, abertaPor e encerradaPor vêm para quem tem outro papel no hotel,
 * como na parada.
 */
export const PeriodoDeUhApi = z
  .object({
    id: z.guid(),
    localId: z.guid(),
    chamadoId: z.guid().optional(),
    inicio: z.iso.datetime(),
    /** null: a UH ainda está indisponível. */
    fim: z.iso.datetime().nullable(),
    abertaPor: z.guid().optional(),
    encerradaPor: z.guid().nullable().optional(),
    /** Do início ao fim, ou até agora se aberto, em milissegundos. */
    tempoIndisponivelMs: z.int().min(0),
  })
  .meta({ id: 'PeriodoDeUhApi' });

export const RespostaDeUhIndisponivel = z
  .object({
    /** Do mais novo para o mais antigo. */
    periodos: z.array(PeriodoDeUhApi),
  })
  .meta({ id: 'RespostaDeUhIndisponivel' });

export const PedidoDeUhIndisponivel = z
  .object({
    /** Sem início, agora. */
    desde: z.iso.datetime().nullish(),
  })
  .meta({ id: 'PedidoDeUhIndisponivel' });

export const RespostaDeUhMarcada = z.object({ id: z.guid() }).meta({ id: 'RespostaDeUhMarcada' });

export const PedidoDeLiberacaoDeUh = z
  .object({
    /** Sem fim, agora. */
    fim: z.iso.datetime().nullish(),
  })
  .meta({ id: 'PedidoDeLiberacaoDeUh' });

export const RespostaDeUhLiberada = z
  .object({ id: z.guid(), fim: z.iso.datetime() })
  .meta({ id: 'RespostaDeUhLiberada' });
