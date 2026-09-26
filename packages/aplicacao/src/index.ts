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
