// Tradutor sobre @formatjs/intl (ADR-022): o mesmo motor que o react-intl usa
// no web e no PWA, aqui sem React, para o servidor e o worker (e-mail, push).
import { type IntlShape, createIntl, createIntlCache } from '@formatjs/intl';
import { type Chave, type Mensagens, mensagensDe } from './catalogos';
import { IDIOMA_FONTE, type IdiomaDeExibicao, PSEUDO_IDIOMA } from './idiomas';

export type ValoresDeMensagem = Record<string, string | number | Date>;

/**
 * Locale entregue ao motor ICU (plural, select ordinal). O pseudo-idioma usa
 * as regras do inglês: "en-XA" não tem dados de plural no Intl.
 */
export const localeDoMotor = (idioma: IdiomaDeExibicao): string =>
  idioma === PSEUDO_IDIOMA ? 'en' : idioma;

export interface Tradutor {
  readonly idioma: IdiomaDeExibicao;
  readonly intl: IntlShape<string>;
  t(chave: Chave, valores?: ValoresDeMensagem): string;
}

const cacheIntl = createIntlCache();

export function criarTradutor(idioma: IdiomaDeExibicao): Tradutor {
  const mensagens: Mensagens = mensagensDe(idioma);
  const intl = createIntl(
    {
      locale: localeDoMotor(idioma),
      defaultLocale: IDIOMA_FONTE,
      messages: mensagens,
      // Mensagem ICU inválida ou variável faltando é defeito: falha alto, em
      // vez de mostrar a chave. As chaves são tipadas, e a CI valida o ICU.
      onError: (erro) => {
        throw erro;
      },
    },
    cacheIntl,
  );
  return {
    idioma,
    intl,
    t: (chave, valores) => intl.formatMessage({ id: chave }, valores),
  };
}
