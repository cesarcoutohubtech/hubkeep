// Ativos do hotel (fase 1a, B3; ADR-028 e ADR-029): local, categoria, campos
// estendidos, fabricante, modelo, número de série e a versão que o cliente
// devolve na alteração. A validação dos campos contra a categoria é do domínio.
// Compra, garantia e criticidade (fase 1b, I1): opcionais na gravação, para a
// operação guardada no aparelho antes da I1 continuar valendo; na alteração,
// ausente mantém o valor gravado e null apaga.
import { z } from 'zod';
import { NomesDeCriticidadeApi } from './configuracao';

/** Data de calendário aaaa-mm-dd; a existência da data é conferida no domínio. */
const DataDoAtivo = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CriticidadeApi = z.int().min(1).max(5);

export const ValoresDeCampoApi = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .meta({ id: 'ValoresDeCampoApi' });

export const AtivoApi = z
  .object({
    id: z.guid(),
    localId: z.guid(),
    categoriaId: z.guid().nullable(),
    /**
     * O modelo de que o ativo nasceu (M1); os dados copiados ficam no ativo.
     * Opcional na leitura, para o PWA novo aceitar a resposta do servidor de
     * antes da M1 durante a publicação.
     */
    modeloId: z.guid().nullable().optional(),
    nome: z.string(),
    fabricante: z.string().nullable(),
    modelo: z.string().nullable(),
    numeroSerie: z.string().nullable(),
    dataCompra: DataDoAtivo.nullable(),
    garantiaAte: DataDoAtivo.nullable(),
    /** De 1 (menor) a 5 (maior); o nome do nível vem de nomesDeCriticidade ou do catálogo. */
    criticidade: CriticidadeApi.nullable(),
    /** Lidos com a definição atual da categoria. */
    campos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    versao: z.number().int().min(1),
    ativo: z.boolean(),
    /** Código do QR individual (B5): 10 caracteres, imutável. */
    codigoQr: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{10}$/),
    /** Início da parada aberta (C5); null se não está parado. */
    paradoDesde: z.iso.datetime().nullable(),
  })
  .meta({ id: 'AtivoApi' });

/** O ativo aberto pelo QR (B5), com o hotel, para o aparelho saber onde ele está. */
export const RespostaDeAtivoDoQr = z
  .object({ hotelId: z.guid(), ativo: AtivoApi })
  .meta({ id: 'RespostaDeAtivoDoQr' });

export const RespostaDeAtivosDoHotel = z
  .object({
    ativos: z.array(AtivoApi),
    /** A política ativo.criticidade resolvida para o hotel; o nível sem nome usa o catálogo. */
    nomesDeCriticidade: NomesDeCriticidadeApi,
  })
  .meta({ id: 'RespostaDeAtivosDoHotel' });

const gravacao = {
  categoriaId: z.guid().nullable(),
  nome: z.string().max(200),
  fabricante: z.string().max(200).nullable(),
  modelo: z.string().max(200).nullable(),
  numeroSerie: z.string().max(200).nullable(),
  campos: ValoresDeCampoApi.optional(),
  dataCompra: DataDoAtivo.nullable().optional(),
  garantiaAte: DataDoAtivo.nullable().optional(),
  criticidade: z.number().nullable().optional(),
  /** O modelo escolhido (M1); ausente mantém o gravado (alteração) ou fica nulo (cadastro). */
  modeloId: z.guid().nullable().optional(),
};

export const PedidoDeCadastroDeAtivo = z
  .object({ localId: z.guid(), ...gravacao })
  .meta({ id: 'PedidoDeCadastroDeAtivo' });

export const PedidoDeAlteracaoDeAtivo = z
  .object({ versao: z.number().int().min(1), ...gravacao })
  .meta({ id: 'PedidoDeAlteracaoDeAtivo' });

/** Desativação e reativação levam só a versão vista (ADR-029). */
export const PedidoDeVersaoDeAtivo = z
  .object({ versao: z.number().int().min(1) })
  .meta({ id: 'PedidoDeVersaoDeAtivo' });

export const RespostaDeAtivoGravado = z
  .object({ id: z.guid(), versao: z.number().int().min(1) })
  .meta({ id: 'RespostaDeAtivoGravado' });

/** Mover o ativo para outro local do mesmo hotel (B3c), com a versão vista. */
export const PedidoDeMovimentacaoDeAtivo = z
  .object({ localDestinoId: z.guid(), versao: z.number().int().min(1) })
  .meta({ id: 'PedidoDeMovimentacaoDeAtivo' });

export const MovimentacaoDeAtivoApi = z
  .object({
    id: z.guid(),
    localOrigemId: z.guid(),
    localDestinoId: z.guid(),
    usuarioId: z.guid(),
    nomeUsuario: z.string().nullable(),
    movidoEm: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'MovimentacaoDeAtivoApi' });

export const RespostaDeMovimentacoesDoAtivo = z
  .object({ movimentacoes: z.array(MovimentacaoDeAtivoApi) })
  .meta({ id: 'RespostaDeMovimentacoesDoAtivo' });
