// Contrato do adaptador de sistema hoteleiro (F0-08, ADR-008). O agente
// conector lê o sistema do cliente (TOTVS CM, ou planilha como alternativa) e
// envia lotes para POST /api/v1/ingestao/lotes. O HubKeep grava no staging sem
// limite de licença; a promoção para app.local é do worker.
import { z } from 'zod';

/** Sistemas de origem aceitos. A planilha é a alternativa da fase 0. */
export const FONTES = ['totvs_cm', 'planilha'] as const;
export type Fonte = (typeof FONTES)[number];

/** O que o adaptador sabe ler. `status_uh` fica para quando o CM for lido. */
export const ENTIDADES_EXTERNAS = ['hotel', 'uh'] as const;
export type EntidadeExterna = (typeof ENTIDADES_EXTERNAS)[number];

/**
 * Limites do lote. O corpo da função da Vercel aceita até 4,5 MB (docs/01);
 * o endpoint recusa acima de LIMITE_BYTES_LOTE e o agente divide antes.
 */
export const LIMITE_REGISTROS_LOTE = 2000;
export const LIMITE_BYTES_LOTE = 4 * 1024 * 1024;

/**
 * Limites do corpo das demais rotas (ADR-032, condição 2). Toda rota que lê
 * corpo tem limite: o padrão, se não declara outro. O padrão dá folga ao maior
 * formulário (categoria com campos, opções e rótulos nos quatro idiomas). O
 * máximo é o maior limite de qualquer rota (o do lote): o proxy recusa acima
 * dele pelo content-length, antes de qualquer handler.
 */
export const LIMITE_BYTES_PADRAO = 256 * 1024;
export const LIMITE_BYTES_MAXIMO = LIMITE_BYTES_LOTE;

export const RegistroExterno = z
  .object({
    /** Código no sistema de origem (cod_externo). */
    chave: z.string().trim().min(1).max(200),
    dados: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'RegistroExterno' });
export type RegistroExterno = z.infer<typeof RegistroExterno>;

export const LoteDeIngestao = z
  .object({
    fonte: z.enum(FONTES),
    entidade: z.enum(ENTIDADES_EXTERNAS),
    registros: z.array(RegistroExterno).min(1).max(LIMITE_REGISTROS_LOTE),
  })
  .meta({ id: 'LoteDeIngestao' });
export type LoteDeIngestao = z.infer<typeof LoteDeIngestao>;

export const RespostaDeLote = z
  .object({
    cargaId: z.guid(),
    /** Hash calculado pelo servidor; lote igual tem hash igual. */
    loteHash: z.string(),
    /** false: o mesmo lote já tinha sido recebido e nada foi reprocessado. */
    novo: z.boolean(),
    registros: z.number().int().nonnegative(),
  })
  .meta({ id: 'RespostaDeLote' });
export type RespostaDeLote = z.infer<typeof RespostaDeLote>;

/**
 * Dados de uma UH, como a promoção para app.local espera em `dados`. O agente
 * de cada sistema traduz os campos dele para este formato.
 */
export const DadosDeUh = z.object({
  /** cod_externo do hotel no mesmo sistema de origem. */
  hotel: z.string().trim().min(1).max(200),
  nome: z.string().trim().min(1).max(200),
  andar: z.string().trim().max(50).nullish(),
});
export type DadosDeUh = z.infer<typeof DadosDeUh>;

/**
 * Dados de um hotel, como a ativação (fase 1a, A1) espera em `dados`. O fuso
 * (IANA) é opcional: sem ele, o Admin informa na importação.
 */
export const DadosDeHotel = z.object({
  nome: z.string().trim().min(1).max(200),
  fuso: z.string().trim().max(64).nullish(),
});
export type DadosDeHotel = z.infer<typeof DadosDeHotel>;

/**
 * O que todo adaptador de sistema hoteleiro implementa. Os registros saem em
 * ordem estável de chave, para o mesmo conteúdo gerar o mesmo lote.
 */
export interface AdaptadorDeSistemaHoteleiro {
  readonly fonte: Fonte;
  ler(entidade: EntidadeExterna): Promise<RegistroExterno[]>;
}
