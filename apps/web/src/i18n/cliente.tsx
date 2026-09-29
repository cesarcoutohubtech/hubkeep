'use client';
// react-intl no cliente (ADR-022): o layout do servidor escolhe o idioma e
// entrega só as mensagens dele; as telas traduzem por chave tipada (useT).
import {
  type Chave,
  IDIOMAS,
  IDIOMA_FONTE,
  type IdiomaDeExibicao,
  type Mensagens,
  PSEUDO_IDIOMA,
  type ValoresDeMensagem,
  localeDoMotor,
} from '@hubkeep/i18n';
import { useRouter } from 'next/navigation';
import { type ReactNode, createContext, useCallback, useContext, useMemo } from 'react';
import { IntlProvider, useIntl } from 'react-intl';

interface EstadoDeIdioma {
  idioma: IdiomaDeExibicao;
  /** Idiomas oferecidos no seletor (o pseudo só em dev e homologação). */
  opcoes: readonly IdiomaDeExibicao[];
}

const ContextoDeIdioma = createContext<EstadoDeIdioma>({ idioma: IDIOMA_FONTE, opcoes: IDIOMAS });

export function ProvedorDeIdioma(props: {
  idioma: IdiomaDeExibicao;
  mensagens: Mensagens;
  pseudoLiberado: boolean;
  children: ReactNode;
}) {
  const estado = useMemo<EstadoDeIdioma>(
    () => ({
      idioma: props.idioma,
      opcoes: props.pseudoLiberado ? [...IDIOMAS, PSEUDO_IDIOMA] : IDIOMAS,
    }),
    [props.idioma, props.pseudoLiberado],
  );
  return (
    <ContextoDeIdioma.Provider value={estado}>
      <IntlProvider
        locale={localeDoMotor(props.idioma)}
        defaultLocale={IDIOMA_FONTE}
        messages={props.mensagens}
      >
        {props.children}
      </IntlProvider>
    </ContextoDeIdioma.Provider>
  );
}

/** Tradução por chave do catálogo pt-BR (chave inexistente não compila). */
export function useT(): (chave: Chave, valores?: ValoresDeMensagem) => string {
  const intl = useIntl();
  return useCallback((chave, valores) => intl.formatMessage({ id: chave }, valores), [intl]);
}

export const useIdioma = () => useContext(ContextoDeIdioma);

/**
 * Mensagem de um erro da API pelo catálogo (erro.<codigo>), com os parâmetros
 * simples do erro. Código sem mensagem cai para a genérica.
 */
export function useMensagemDeErro(): (erro: {
  codigo: string;
  parametros?: Record<string, unknown>;
}) => string {
  const intl = useIntl();
  return useCallback(
    (erro) => {
      const valores: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(erro.parametros ?? {})) {
        if (typeof v === 'string' || typeof v === 'number') valores[k] = v;
      }
      const id = `erro.${erro.codigo}`;
      return id in intl.messages
        ? intl.formatMessage({ id }, valores)
        : intl.formatMessage({ id: 'erro.erro_interno' });
    },
    [intl],
  );
}

/** Nome do idioma nele mesmo (endônimo), sem texto no catálogo: vem do Intl. */
export function nomeDoIdioma(idioma: IdiomaDeExibicao): string {
  const codigo = idioma === PSEUDO_IDIOMA ? 'en-XA' : idioma;
  return new Intl.DisplayNames([codigo], { type: 'language' }).of(codigo) ?? codigo;
}

/**
 * Cookie hk_idioma: vale só sem sessão (tela de login). Com sessão, o layout
 * resolve pelo perfil e o cookie é ignorado (i18n/servidor.ts).
 */
export function gravarCookieDeIdioma(idioma: IdiomaDeExibicao): void {
  document.cookie = `hk_idioma=${idioma}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
}

/** Grava o idioma no cookie e pede ao servidor a página de novo. */
export function useTrocarIdioma(): (idioma: IdiomaDeExibicao) => void {
  const router = useRouter();
  return useCallback(
    (idioma) => {
      gravarCookieDeIdioma(idioma);
      router.refresh();
    },
    [router],
  );
}

/** Seletor de idioma; `aoEscolher` troca só a tela (antes do login) ou grava no perfil. */
export function SeletorDeIdioma(props: { aoEscolher?: (idioma: IdiomaDeExibicao) => void }) {
  const t = useT();
  const { idioma, opcoes } = useIdioma();
  const trocar = useTrocarIdioma();
  const escolher = props.aoEscolher ?? trocar;
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {t('comum.idioma')}
      <select value={idioma} onChange={(e) => escolher(e.target.value as IdiomaDeExibicao)}>
        {opcoes.map((i) => (
          <option key={i} value={i}>
            {nomeDoIdioma(i)}
          </option>
        ))}
      </select>
    </label>
  );
}
