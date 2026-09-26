// Listas fechadas de idioma e formato regional (ADR-022). Não há tabela global
// de idioma: a lista mora aqui, e a coluna `idioma` no banco tem restrição com
// estes mesmos valores (tests/i18n-banco.test.ts confere que batem). Idioma
// novo exige migração que amplia a restrição.

/** Idiomas de interface. pt-BR é o idioma-fonte dos catálogos. */
export const IDIOMAS = ['pt-BR', 'en', 'es', 'fr'] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_FONTE: Idioma = 'pt-BR';

/**
 * Pseudo-idioma (dev e homologação): acentos e texto ~35% mais longo, para
 * achar texto fixo e quebra de layout. Nunca é gravado no banco.
 */
export const PSEUDO_IDIOMA = 'en-XA';
export type IdiomaDeExibicao = Idioma | typeof PSEUDO_IDIOMA;

/**
 * Formatos regionais (datas, números, moeda), escolha separada do idioma.
 * es-419 é o espanhol da América Latina.
 */
export const FORMATOS_REGIONAIS = [
  'pt-BR',
  'pt-PT',
  'en-US',
  'en-GB',
  'es-419',
  'es-ES',
  'es-MX',
  'es-AR',
  'es-CL',
  'es-CO',
  'fr-FR',
  'fr-CA',
] as const;
export type FormatoRegional = (typeof FORMATOS_REGIONAIS)[number];

/** Formato regional de quem não escolheu um: o do idioma. */
export const FORMATO_DO_IDIOMA: Record<Idioma, FormatoRegional> = {
  'pt-BR': 'pt-BR',
  en: 'en-US',
  es: 'es-419',
  fr: 'fr-FR',
};

export const ehIdioma = (v: unknown): v is Idioma =>
  typeof v === 'string' && (IDIOMAS as readonly string[]).includes(v);

export const ehFormatoRegional = (v: unknown): v is FormatoRegional =>
  typeof v === 'string' && (FORMATOS_REGIONAIS as readonly string[]).includes(v);

/**
 * Fuso IANA válido (ex.: America/Sao_Paulo). Validado na aplicação, não no
 * banco (ADR-005: sem trigger nem função). Recusa deslocamento fixo ("-03:00"),
 * que o Intl aceita mas não acompanha horário de verão.
 */
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || fuso.length > 64) return false;
  if (fuso !== 'UTC' && !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(fuso)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}
