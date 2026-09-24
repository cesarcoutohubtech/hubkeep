// @hubkeep/aplicacao — casos de uso e portas (orquestração e permissão de ação).
export { TokenInvalido } from './portas/identidade';
export type {
  EnviadorDeEmail,
  PedidoDeConvite,
  ProvedorDeConvite,
  UsuarioVerificado,
  VerificadorDeToken,
} from './portas/identidade';
export type { HotelVisivel, PortaAtribuicoes, PortaHoteis, Relogio } from './portas/papeis';
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
