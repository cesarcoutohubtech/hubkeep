// Termos dos catálogos (fase 1c, item 10; docs/referencia/termos-dos-catalogos.md):
// cada conceito com um só termo por idioma. A CI reprova as variantes que o
// glossário barra. Os textos do Intelligence (inteligencia.*) são do Kaio
// (ADR-033) e ficam de fora.
import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/index';

const VARIANTES: Record<'en' | 'es' | 'fr', RegExp[]> = {
  en: [/\btickets?\b/i, /\blandlords?\b/i, /\btenant operators?\b/i],
  es: [/\btickets?\b/i, /\b[oó]rden(es)? de servicio\b/i, /\bOS\b/],
  fr: [/\btickets?\b/i, /\bordres? de service\b/i, /\bOS\b/, /\bprestataires?\b/i],
};

const doNucleo = (chave: string) => !chave.startsWith('inteligencia.');

describe('termos dos catálogos', () => {
  it.each(Object.entries(VARIANTES))('%s: sem as variantes barradas', (idioma, variantes) => {
    const catalogo = CATALOGOS[idioma as keyof typeof VARIANTES];
    const achadas = Object.entries(catalogo)
      .filter(([chave]) => doNucleo(chave))
      .flatMap(([chave, texto]) =>
        variantes.filter((v) => v.test(texto ?? '')).map((v) => `${chave}: ${v.source}`),
      );
    expect(achadas).toEqual([]);
  });

  it('controle: a variante aparece quando existe', () => {
    expect(VARIANTES.en.some((v) => v.test('Open the ticket'))).toBe(true);
    expect(VARIANTES.es.some((v) => v.test('Imprimir OS'))).toBe(true);
    expect(VARIANTES.fr.some((v) => v.test('Retour aux ordres de service'))).toBe(true);
  });
});
