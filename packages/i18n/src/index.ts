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
export { resolverNome } from './nomes';
export type { NomesPorIdioma } from './nomes';
export { CATALOGOS, QUEDA_DE_TRADUCAO, mensagensDe, mesclarPelaQueda } from './catalogos';
export type { Chave, Mensagens } from './catalogos';
export { EXPANSAO_PSEUDO, pseudoMensagem } from './pseudo';
export { criarTradutor, localeDoMotor } from './tradutor';
export type { Tradutor, ValoresDeMensagem } from './tradutor';
export { criarFormatador, separadorDeCsv } from './formatacao';
export type { Formatador } from './formatacao';
export { emailDeAvisoDeSla, emailDeConvite, emailDeRecuperacao, escaparHtml } from './emails';
export type { DadosDoAvisoDeSla, DadosDoConvite, Email, EmailComTexto } from './emails';
export { pushDeAvisoDeSla, pushDeOsAtribuida } from './push';
export type { Push } from './push';
export { TAMANHO_MINIMO_DA_BUSCA, textoDeBusca } from './busca';
