// Parada do equipamento (fase 1a, C5): as paradas do ativo, com o tempo
// parado calculado no domínio, e o encerramento pela gestão do hotel. O
// registro vai na abertura do chamado (paradoDesde) e na execução, pelas
// operações offline (os.registrar_parada, os.encerrar_parada).
import { z } from 'zod';

export const ParadaApi = z
  .object({
    id: z.guid(),
    ativoId: z.guid(),
    chamadoId: z.guid(),
    /** A OS em que foi registrada; null se nasceu com o chamado. */
    osId: z.guid().nullable(),
    inicio: z.iso.datetime(),
    /** null: o ativo ainda está parado. */
    fim: z.iso.datetime().nullable(),
    abertaPor: z.guid(),
    encerradaPor: z.guid().nullable(),
    /** Do início ao fim, ou até agora se aberta, em milissegundos. */
    tempoParadoMs: z.int().min(0),
  })
  .meta({ id: 'ParadaApi' });

export const RespostaDeParadasDoAtivo = z
  .object({
    /** Da mais nova para a mais antiga. */
    paradas: z.array(ParadaApi),
    /** Soma sem contar duas vezes o trecho em que duas se sobrepõem. */
    tempoParadoMs: z.int().min(0),
  })
  .meta({ id: 'RespostaDeParadasDoAtivo' });

export const PedidoDeEncerramentoDeParada = z
  .object({
    /** Sem fim, agora. */
    fim: z.iso.datetime().nullish(),
  })
  .meta({ id: 'PedidoDeEncerramentoDeParada' });

export const RespostaDeParadaEncerrada = z
  .object({ id: z.guid(), fim: z.iso.datetime() })
  .meta({ id: 'RespostaDeParadaEncerrada' });
