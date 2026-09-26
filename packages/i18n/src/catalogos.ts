// Catálogos ICU por idioma (ADR-022). pt-BR é o idioma-fonte e define as
// chaves: chave que não existe em pt-BR é erro de typecheck. en é obrigatório
// (a CI reprova chave sem pt-BR ou sem en). Enquanto a tradução não chega, cada
// idioma cai pela própria cadeia (QUEDA_DE_TRADUCAO). Antes do piloto, a CI
// passa a exigir os quatro completos (pendência no docs/04).
import en from '../catalogos/en.json' with { type: 'json' };
import es from '../catalogos/es.json' with { type: 'json' };
import fr from '../catalogos/fr.json' with { type: 'json' };
import ptBR from '../catalogos/pt-BR.json' with { type: 'json' };
import { type Idioma, type IdiomaDeExibicao, PSEUDO_IDIOMA } from './idiomas';
import { pseudoMensagem } from './pseudo';

export type Chave = keyof typeof ptBR;
export type Mensagens = Record<Chave, string>;

/** Os catálogos como estão nos arquivos, sem queda para outro idioma. */
export const CATALOGOS: Record<Idioma, Partial<Record<string, string>>> = {
  'pt-BR': ptBR,
  en,
  es,
  fr,
};

/**
 * Queda de tradução, do primeiro ao último (Cesar, 26/09/2026, ADR-022): o
 * espanhol cai para o português, mais próximo, e o francês para o inglês.
 */
export const QUEDA_DE_TRADUCAO: Record<Idioma, readonly Idioma[]> = {
  'pt-BR': ['pt-BR'],
  en: ['en', 'pt-BR'],
  es: ['es', 'pt-BR', 'en'],
  fr: ['fr', 'en', 'pt-BR'],
};

/** Junta os catálogos da cadeia: vale o primeiro idioma que tem a chave. */
export function mesclarPelaQueda(
  cadeia: readonly Idioma[],
  catalogos: Record<Idioma, Partial<Record<string, string>>>,
): Record<string, string> {
  const mensagens: Record<string, string> = {};
  for (const idioma of [...cadeia].reverse()) {
    for (const [chave, texto] of Object.entries(catalogos[idioma])) {
      if (texto !== undefined) mensagens[chave] = texto;
    }
  }
  return mensagens;
}

const cache = new Map<IdiomaDeExibicao, Mensagens>();

/** Mensagens completas de um idioma, pela cadeia de QUEDA_DE_TRADUCAO. */
export function mensagensDe(idioma: IdiomaDeExibicao): Mensagens {
  const pronto = cache.get(idioma);
  if (pronto) return pronto;
  let mensagens: Mensagens;
  if (idioma === PSEUDO_IDIOMA) {
    mensagens = Object.fromEntries(
      Object.entries(ptBR).map(([chave, texto]) => [chave, pseudoMensagem(texto)]),
    ) as Mensagens;
  } else {
    mensagens = mesclarPelaQueda(QUEDA_DE_TRADUCAO[idioma], CATALOGOS) as Mensagens;
  }
  cache.set(idioma, mensagens);
  return mensagens;
}
