// Catálogos ICU por idioma (ADR-022). pt-BR é o idioma-fonte e define as
// chaves: chave que não existe em pt-BR é erro de typecheck. en é obrigatório
// (a CI reprova chave sem pt-BR ou sem en); es e fr caem para en e depois
// para pt-BR enquanto a tradução não chega.
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

const cache = new Map<IdiomaDeExibicao, Mensagens>();

/** Mensagens completas de um idioma, com a queda es/fr → en → pt-BR. */
export function mensagensDe(idioma: IdiomaDeExibicao): Mensagens {
  const pronto = cache.get(idioma);
  if (pronto) return pronto;
  let mensagens: Mensagens;
  if (idioma === PSEUDO_IDIOMA) {
    mensagens = Object.fromEntries(
      Object.entries(ptBR).map(([chave, texto]) => [chave, pseudoMensagem(texto)]),
    ) as Mensagens;
  } else if (idioma === 'pt-BR') {
    mensagens = ptBR;
  } else {
    mensagens = { ...ptBR, ...en, ...CATALOGOS[idioma] } as Mensagens;
  }
  cache.set(idioma, mensagens);
  return mensagens;
}
