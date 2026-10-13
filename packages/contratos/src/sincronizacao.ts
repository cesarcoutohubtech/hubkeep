// Operações que o PWA do técnico fez sem rede (F0-11, ADR-025). Cada uma leva
// a chave de idempotência gerada no aparelho; o reenvio da mesma chave devolve
// a resposta guardada, sem aplicar de novo. As da OS (C4) são do Técnico
// responsável; as transições levam a versão que o aparelho calculou. A parada
// do ativo do chamado (C5) também: registrar e encerrar, na OS. As respostas
// do checklist (PV1, ADR-040) vão sem a versão da OS e mesclam item a item.
import { z } from 'zod';
import { PedidoDeAlteracaoDeAtivo, PedidoDeCadastroDeAtivo } from './ativos';
import { PedidoDeAberturaDeChamado } from './chamados';
import { MOTIVOS_DE_PAUSA_API } from './configuracao';
import { PedidoDePreferencias } from './preferencias';

export const TIPOS_DE_OPERACAO_OFFLINE = [
  'preferencias.gravar',
  'ativo.cadastrar',
  'ativo.alterar',
  'chamado.abrir',
  'os.iniciar',
  'os.pausar',
  'os.retomar',
  'os.concluir',
  'os.apontar_horas',
  'os.registrar_material',
  'os.registrar_parada',
  'os.encerrar_parada',
  'os.responder_checklist',
] as const;

/** Transição da OS pelo Técnico, com a versão esperada (ADR-029). */
/**
 * A transição leva a versão da OS no aparelho e, desde a I9, a hora em que o
 * técnico agiu (opcional: a operação guardada antes não tem). O domínio
 * ajusta a hora fora de ordem ou no futuro (horaDaTransicao).
 */
const TransicaoDaOs = z.object({
  osId: z.guid(),
  versao: z.number().int().min(1),
  feitaEm: z.iso.datetime().optional(),
});

export const PedidoDeOperacaoOffline = z
  .discriminatedUnion('tipo', [
    z.object({
      /** Gerada no aparelho (crypto.randomUUID), uma por operação. */
      chave: z.guid(),
      tipo: z.literal('preferencias.gravar'),
      dados: PedidoDePreferencias,
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('ativo.cadastrar'),
      dados: PedidoDeCadastroDeAtivo,
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('ativo.alterar'),
      /** A versão vista no aparelho; se o ativo mudou, 409 conflito_de_versao (ADR-029). */
      dados: PedidoDeAlteracaoDeAtivo.extend({ ativoId: z.guid() }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('chamado.abrir'),
      /** O chamado é criado uma vez só, mesmo com reenvio (C2). */
      dados: PedidoDeAberturaDeChamado,
    }),
    ...(['os.iniciar', 'os.retomar'] as const).map((tipo) =>
      z.object({ chave: z.guid(), tipo: z.literal(tipo), dados: TransicaoDaOs }),
    ),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.pausar'),
      /**
       * O motivo da pausa (1c, ADR-042): com ele na lista da política e a
       * categoria do chamado com a pausa ligada, a pausa para o relógio da
       * solução. Sem motivo (operação gravada antes dele), nunca para.
       */
      dados: TransicaoDaOs.extend({ motivo: z.enum(MOTIVOS_DE_PAUSA_API).optional() }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.concluir'),
      /**
       * Com a parada do chamado aberta, a resposta a "o equipamento voltou a
       * funcionar?" e a hora do aparelho: sim, a parada encerra com essa hora,
       * na mesma operação. Sem resposta, a parada fica aberta.
       */
      dados: TransicaoDaOs.extend({
        equipamentoVoltou: z.boolean().optional(),
        /** Com a UH do chamado indisponível (I4): "a UH foi liberada?"; sim, encerra com essa hora. */
        uhLiberada: z.boolean().optional(),
        concluidaEm: z.iso.datetime().optional(),
        /**
         * Os códigos sugeridos pelo técnico (I6), todos opcionais. O que não
         * serve é descartado no servidor; a conclusão nunca é recusada por eles.
         */
        codigos: z
          .object({
            falhaId: z.guid().nullish(),
            causaId: z.guid().nullish(),
            solucaoId: z.guid().nullish(),
          })
          .optional(),
      }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.apontar_horas'),
      /** Início e fim como o aparelho registrou; o limite é conferido no domínio. */
      dados: z.object({ osId: z.guid(), inicio: z.iso.datetime(), fim: z.iso.datetime() }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.registrar_material'),
      /** Texto livre; normalizado no domínio (até 500). */
      dados: z.object({ osId: z.guid(), descricao: z.string().max(2000) }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.registrar_parada'),
      /** Sem fim, a parada fica aberta; os instantes são conferidos no domínio. */
      dados: z.object({
        osId: z.guid(),
        inicio: z.iso.datetime(),
        fim: z.iso.datetime().nullable(),
      }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.encerrar_parada'),
      /** Encerra a parada aberta do ativo do chamado da OS. */
      dados: z.object({ osId: z.guid(), fim: z.iso.datetime() }),
    }),
    z.object({
      chave: z.guid(),
      tipo: z.literal('os.responder_checklist'),
      /**
       * Por item do checklist da OS, o valor no tipo do item ou null (limpa);
       * o domínio confere contra a cópia. A hora do aparelho é limitada à do
       * servidor.
       */
      dados: z.object({
        osId: z.guid(),
        respostas: z.record(
          z.string().max(64),
          z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
        ),
        feitaEm: z.iso.datetime().optional(),
      }),
    }),
  ])
  .meta({ id: 'PedidoDeOperacaoOffline' });
export type PedidoDeOperacaoOffline = z.infer<typeof PedidoDeOperacaoOffline>;

export const RespostaDeOperacaoOffline = z
  .object({
    chave: z.guid(),
    /** true: a chave já tinha chegado; nada foi aplicado de novo. */
    repetida: z.boolean(),
    resposta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .meta({ id: 'RespostaDeOperacaoOffline' });
export type RespostaDeOperacaoOffline = z.infer<typeof RespostaDeOperacaoOffline>;
