// Parada do equipamento (fase 1a, C5): as paradas do ativo, com o tempo
// parado calculado no domínio, e o encerramento pela gestão do hotel. O
// registro vai na abertura do chamado (paradoDesde) e na execução, pelas
// operações offline (os.registrar_parada, os.encerrar_parada).
import { z } from 'zod';

/**
 * O proprietário recebe só o ativo, o estado (aberta: fim null) e as datas;
 * chamadoId, osId, abertaPor e encerradaPor vêm para quem tem outro papel no
 * hotel (decisão do Cesar de 30/09/2026).
 */
export const ParadaApi = z
  .object({
    id: z.guid(),
    ativoId: z.guid(),
    chamadoId: z.guid().optional(),
    /** A OS em que foi registrada; null se nasceu com o chamado. */
    osId: z.guid().nullable().optional(),
    inicio: z.iso.datetime(),
    /** null: o ativo ainda está parado. */
    fim: z.iso.datetime().nullable(),
    abertaPor: z.guid().optional(),
    encerradaPor: z.guid().nullable().optional(),
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

/** Parada aberta com a OS do chamado concluída ou aceita, para a gestão do hotel acompanhar. */
export const ParadaPendenteApi = z
  .object({
    id: z.guid(),
    hotelId: z.guid(),
    ativoId: z.guid(),
    ativoNome: z.string(),
    chamadoId: z.guid(),
    /** A OS concluída (ou aceita) do chamado. */
    osId: z.guid(),
    osEstado: z.enum(['concluida', 'aceita']),
    inicio: z.iso.datetime(),
    tempoParadoMs: z.int().min(0),
  })
  .meta({ id: 'ParadaPendenteApi' });

export const RespostaDeParadasPendentes = z
  .object({
    /** Da mais antiga para a mais nova. */
    paradas: z.array(ParadaPendenteApi),
  })
  .meta({ id: 'RespostaDeParadasPendentes' });
