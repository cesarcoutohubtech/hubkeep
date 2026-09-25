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
