// Preferências de idioma e região do próprio usuário (F0-10b, ADR-022).
//
// Repete a lista de idiomas de @hubkeep/i18n porque contratos não depende de
// outros pacotes (o conector só conhece contratos); tests/contratos-dominio
// falha se as duas divergirem. Formato regional e fuso são conferidos no caso
// de uso (formato_regional_nao_aceito, fuso_invalido).
import { z } from 'zod';

export const IDIOMAS_API = ['pt-BR', 'en', 'es', 'fr'] as const;

const Gravadas = {
  /** Nulo: herda do tenant (ou do navegador). */
  idioma: z.enum(IDIOMAS_API).nullable(),
  /** BCP 47 da lista de @hubkeep/i18n (ex.: pt-BR, en-GB, es-419). Nulo: o do idioma. */
  formatoRegional: z.string().max(16).nullable(),
  /** Fuso IANA (ex.: America/Sao_Paulo). Nulo: o padrão. */
  fuso: z.string().max(64).nullable(),
};

export const PedidoDePreferencias = z.object(Gravadas).meta({ id: 'PedidoDePreferencias' });

export const RespostaDePreferencias = z
  .object({
    idioma: z.enum(IDIOMAS_API),
    formatoRegional: z.string(),
    fuso: z.string(),
    /** ISO 4217, do tenant. */
    moeda: z.string(),
    /** O que o próprio usuário escolheu; nulo é herdado. */
    gravadas: z.object(Gravadas),
  })
  .meta({ id: 'RespostaDePreferencias' });
