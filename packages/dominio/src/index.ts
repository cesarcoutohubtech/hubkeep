// @hubkeep/dominio — regras de negócio puras, sem IO (CLAUDE.md, regra 2).
export { Conflito, ErroDeDominio, NaoEncontrado, PermissaoNegada, RegraViolada } from './erros';
export type { Parametros } from './erros';
export {
  ehAdminGrupo,
  exigir,
  hoteisComoImplantador,
  podeAtivarHotel,
  podeConcederPapel,
  podeGerenciarCredencialDeAgente,
  podeRevogarPapel,
  rotulo,
  vigente,
} from './permissoes';
export type { Resultado } from './permissoes';
export { contaComoUh, saldoDeUhs, statusDaUhNova } from './licenca';
export type { SaldoDeUhs, StatusDeHotel, StatusDeLocal, TipoDeLocal } from './licenca';
export { PAPEIS } from './tipos';
export type { Atribuicao, Contexto, Escopo, Papel, PedidoDeConcessao } from './tipos';
