// Resolução do idioma (ADR-022): perfil do membro → idioma padrão do hotel →
// do tenant → navegador (antes do login) → pt-BR. Nulo herda do nível acima.
import {
  FORMATO_DO_IDIOMA,
  type FormatoRegional,
  IDIOMA_FONTE,
  IDIOMAS,
  type Idioma,
  ehFormatoRegional,
  ehIdioma,
  fusoValido,
} from './idiomas';

/** Fuso de quem não tem nenhum definido (nem no perfil, nem no hotel). */
export const FUSO_PADRAO = 'America/Sao_Paulo';

type Talvez<T> = T | null | undefined;

/**
 * Primeiro idioma aceito de um Accept-Language (ou de navigator.languages),
 * pela ordem de preferência. Casa pelo código completo e depois pela língua
 * base: pt-PT → pt-BR, en-GB → en, es-MX → es.
 */
export function idiomaDoNavegador(preferencias: Talvez<string | readonly string[]>): Idioma | null {
  if (!preferencias) return null;
  const lista =
    typeof preferencias === 'string'
      ? preferencias
          .split(',')
          .map((parte, i) => {
            const [codigo = '', ...params] = parte.trim().split(';');
            const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
            return { codigo: codigo.trim(), q: q ? Number(q.slice(2)) : 1, i };
          })
          .filter((p) => p.codigo && p.codigo !== '*' && p.q > 0)
          .sort((a, b) => b.q - a.q || a.i - b.i)
          .map((p) => p.codigo)
      : [...preferencias];
  for (const codigo of lista) {
    const exato = IDIOMAS.find((i) => i.toLowerCase() === codigo.toLowerCase());
    if (exato) return exato;
    const base = codigo.split('-')[0]?.toLowerCase();
    const porBase = IDIOMAS.find((i) => i.split('-')[0]?.toLowerCase() === base);
    if (porBase) return porBase;
  }
  return null;
}

export interface NiveisDeIdioma {
  membro?: Talvez<string>;
  hotel?: Talvez<string>;
  tenant?: Talvez<string>;
  /** Accept-Language ou navigator.languages. */
  navegador?: Talvez<string | readonly string[]>;
}

export function resolverIdioma(niveis: NiveisDeIdioma): Idioma {
  for (const v of [niveis.membro, niveis.hotel, niveis.tenant]) if (ehIdioma(v)) return v;
  return idiomaDoNavegador(niveis.navegador) ?? IDIOMA_FONTE;
}

export function resolverFormatoRegional(membro: Talvez<string>, idioma: Idioma): FormatoRegional {
  return ehFormatoRegional(membro) ? membro : FORMATO_DO_IDIOMA[idioma];
}

export function resolverFuso(niveis: { membro?: Talvez<string>; hotel?: Talvez<string> }): string {
  for (const v of [niveis.membro, niveis.hotel]) if (fusoValido(v)) return v;
  return FUSO_PADRAO;
}
