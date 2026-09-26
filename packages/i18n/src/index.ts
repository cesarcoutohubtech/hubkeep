// @hubkeep/i18n — catálogos ICU, idiomas, resolução e formatação (ADR-022).
// Usado pelo web (react-intl), pelo PWA (react-intl) e pelo worker
// (@formatjs/intl), sempre com os mesmos catálogos. Sem IO.
export {
  FORMATOS_REGIONAIS,
  FORMATO_DO_IDIOMA,
  IDIOMAS,
  IDIOMA_FONTE,
  PSEUDO_IDIOMA,
  ehFormatoRegional,
  ehIdioma,
  fusoValido,
} from './idiomas';
export type { FormatoRegional, Idioma, IdiomaDeExibicao } from './idiomas';
export {
  FUSO_PADRAO,
  idiomaDoNavegador,
  resolverFormatoRegional,
  resolverFuso,
  resolverIdioma,
} from './resolucao';
export type { NiveisDeIdioma } from './resolucao';
export { CATALOGOS, QUEDA_DE_TRADUCAO, mensagensDe, mesclarPelaQueda } from './catalogos';
export type { Chave, Mensagens } from './catalogos';
export { EXPANSAO_PSEUDO, pseudoMensagem } from './pseudo';
export { criarTradutor, localeDoMotor } from './tradutor';
export type { Tradutor, ValoresDeMensagem } from './tradutor';
export { criarFormatador } from './formatacao';
export type { Formatador } from './formatacao';
export { emailDeConvite, escaparHtml } from './emails';
export type { DadosDoConvite, Email } from './emails';
