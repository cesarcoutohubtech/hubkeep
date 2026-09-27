// @hubkeep/aplicacao — casos de uso e portas (orquestração e permissão de ação).
export { TokenInvalido } from './portas/identidade';
export type {
  EnviadorDeEmail,
  EnvioDeConvite,
  PedidoDeConvite,
  ProvedorDeIdentidade,
  UsuarioVerificado,
  VerificadorDeToken,
} from './portas/identidade';
export type { HotelVisivel, PortaAtribuicoes, PortaHoteis, Relogio } from './portas/papeis';
export type { GravacaoDoConvite, PortaConvites, SituacaoDoConvite } from './portas/convites';
export {
  REGRAS_DO_DOMINIO,
  criarCasosDeUsoDePapeis,
  relogioDoSistema,
} from './casos-de-uso/papeis';
export type {
  CasosDeUsoDePapeis,
  DependenciasDePapeis,
  RegrasDePapeis,
} from './casos-de-uso/papeis';
export { criarCasoDeUsoDeConvites } from './casos-de-uso/convites';
export type {
  CasoDeUsoDeConvites,
  DependenciasDeConvites,
  PedidoDeConviteDeMembro,
} from './casos-de-uso/convites';
export { criarManipuladoresDeEventos } from './casos-de-uso/eventos';
export type { EventoPendente, Manipulador } from './casos-de-uso/eventos';
export { CredencialInvalida, formatarCredencial, lerCredencial } from './credencial-agente';
export type {
  Criptografia,
  HotelParaPromocao,
  LocalExistente,
  LoteRecebido,
  PortaCredenciaisDeAgente,
  PortaIngestao,
  PortaPromocaoDeUhs,
  RegistroComHash,
  RegistroRecebido,
  ResultadoDoLote,
  SessaoDeIngestao,
  SessaoDePromocao,
  UhDoStaging,
} from './portas/ingestao';
export { criarCasosDeUsoDeIngestao, hashDoLote } from './casos-de-uso/ingestao';
export type {
  CasosDeUsoDeIngestao,
  DependenciasDeIngestao,
  ResultadoDaPromocao,
} from './casos-de-uso/ingestao';
export { rodarPorTenant } from './casos-de-uso/por-tenant';
export type { ResultadoPorTenant } from './casos-de-uso/por-tenant';
export { ENTIDADES_COM_ANEXO } from './portas/anexos';
export type {
  ArmazenamentoDeArquivos,
  EntidadeComAnexo,
  PortaEscopoDeAnexo,
} from './portas/anexos';
export {
  SEGUNDOS_URL_DE_DOWNLOAD,
  TIPOS_DE_ANEXO,
  criarCasosDeUsoDeAnexos,
} from './casos-de-uso/anexos';
export type { CasosDeUsoDeAnexos, DependenciasDeAnexos, TipoDeAnexo } from './casos-de-uso/anexos';
export type {
  PadroesDoTenant,
  PortaPreferencias,
  PreferenciasGravadas,
} from './portas/preferencias';
export { criarCasosDeUsoDePreferencias, validarPreferencias } from './casos-de-uso/preferencias';
export type { CasosDeUsoDePreferencias, PreferenciasResolvidas } from './casos-de-uso/preferencias';
export type {
  PortaOperacoesOffline,
  RespostaDeOperacao,
  SessaoDeOperacao,
} from './portas/sincronizacao';
export { criarCasosDeUsoDeSincronizacao } from './casos-de-uso/sincronizacao';
export type {
  CasosDeUsoDeSincronizacao,
  OperacaoOffline,
  ResultadoDaOperacao,
} from './casos-de-uso/sincronizacao';
export type {
  HotelCadastrado,
  HotelDoStaging,
  PortaHoteisDoStaging,
  SessaoDeHoteis,
  UsoDaLicenca,
} from './portas/hoteis';
export { criarCasosDeUsoDeHoteis } from './casos-de-uso/hoteis';
export type {
  CasosDeUsoDeHoteis,
  HotelParaAtivacao,
  ResultadoDaAtivacao,
} from './casos-de-uso/hoteis';
export type {
  ConfiguracaoDoHotel,
  ConfiguracaoDoTenant,
  EscopoDePolitica,
  PoliticaGravada,
  PortaConfiguracao,
} from './portas/configuracao';
export { criarCasosDeUsoDeConfiguracao } from './casos-de-uso/configuracao';
export type { CasosDeUsoDeConfiguracao, PoliticaResolvida } from './casos-de-uso/configuracao';
export type { EquipeDoHotel, PortaEquipes } from './portas/equipes';
export { criarCasosDeUsoDeEquipes } from './casos-de-uso/equipes';
export type { CasosDeUsoDeEquipes } from './casos-de-uso/equipes';
export type { BandeiraCadastrada, PortaBandeiras } from './portas/bandeiras';
export { criarCasosDeUsoDeBandeiras } from './casos-de-uso/bandeiras';
export type { CasosDeUsoDeBandeiras } from './casos-de-uso/bandeiras';
export type { MembroComAtribuicoes, PortaMembros } from './portas/membros';
export type { HotelEmImplantacao, PortaImplantacao } from './portas/implantacao';
export { criarCasosDeUsoDeImplantacao } from './casos-de-uso/implantacao';
export type { CasosDeUsoDeImplantacao } from './casos-de-uso/implantacao';
export { REGRAS_DE_MEMBROS, criarCasosDeUsoDeMembros } from './casos-de-uso/membros';
export type { CasosDeUsoDeMembros, RegrasDeMembros } from './casos-de-uso/membros';
