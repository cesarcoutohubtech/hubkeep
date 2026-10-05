// Idioma no PWA (ADR-022). Os quatro catálogos vão no build, porque o app abre
// sem rede. Ordem: o do perfil (lido da API quando há rede e guardado no
// aparelho) → o do aparelho (navigator.languages) → pt-BR. O pseudo-idioma só
// com VITE_PSEUDO_IDIOMA=1 e fora do build de produção.
import {
  type Chave,
  IDIOMAS,
  IDIOMA_FONTE,
  type IdiomaDeExibicao,
  PSEUDO_IDIOMA,
  type ValoresDeMensagem,
  ehIdioma,
  localeDoMotor,
  mensagensDe,
  resolverIdioma,
} from '@hubkeep/i18n';
import { type ReactNode, useCallback } from 'react';
import { IntlProvider, useIntl } from 'react-intl';

const GUARDADO = 'hk_idioma';

export const pseudoIdiomaLiberado = (): boolean =>
  import.meta.env.VITE_PSEUDO_IDIOMA === '1' && !import.meta.env.PROD;

export const opcoesDeIdioma = (): readonly IdiomaDeExibicao[] =>
  pseudoIdiomaLiberado() ? [...IDIOMAS, PSEUDO_IDIOMA] : IDIOMAS;

function lerGuardado(): string | null {
  try {
    return localStorage.getItem(GUARDADO);
  } catch {
    return null;
  }
}

export function idiomaInicial(
  idiomasDoAparelho: readonly string[] = navigator.languages,
): IdiomaDeExibicao {
  const guardado = lerGuardado();
  if (guardado === PSEUDO_IDIOMA && pseudoIdiomaLiberado()) return PSEUDO_IDIOMA;
  return resolverIdioma({
    membro: ehIdioma(guardado) ? guardado : null,
    navegador: idiomasDoAparelho,
  });
}

export function guardarIdioma(idioma: IdiomaDeExibicao): void {
  try {
    localStorage.setItem(GUARDADO, idioma);
  } catch {
    // Sem armazenamento (modo privado): o idioma vale só nesta sessão.
  }
}

export function ProvedorDeIdioma(props: { idioma: IdiomaDeExibicao; children: ReactNode }) {
  return (
    <IntlProvider
      locale={localeDoMotor(props.idioma)}
      defaultLocale={IDIOMA_FONTE}
      messages={mensagensDe(props.idioma)}
    >
      {props.children}
    </IntlProvider>
  );
}

/**
 * O idioma da página no atributo lang do <html>, para o leitor de tela e o
 * hifenizador do navegador (B5 do docs/11). O index.html nasce em pt-BR; o
 * pseudo-idioma conta como inglês, como no layout do web.
 */
export function aplicarIdiomaNaPagina(
  idioma: IdiomaDeExibicao,
  raiz: { lang: string } = document.documentElement,
): void {
  raiz.lang = idioma === PSEUDO_IDIOMA ? 'en' : idioma;
}

/** Tradução por chave do catálogo pt-BR (chave inexistente não compila). */
export function useT(): (chave: Chave, valores?: ValoresDeMensagem) => string {
  const intl = useIntl();
  return useCallback((chave, valores) => intl.formatMessage({ id: chave }, valores), [intl]);
}

/** Nome do idioma nele mesmo (endônimo), pelo Intl. */
export const nomeDoIdioma = (idioma: IdiomaDeExibicao): string =>
  new Intl.DisplayNames([idioma], { type: 'language' }).of(idioma) ?? idioma;
