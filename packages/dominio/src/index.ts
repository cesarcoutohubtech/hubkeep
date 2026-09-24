// @hubkeep/dominio — regras de negócio puras, sem IO (CLAUDE.md, regra 2).
export { ErroDeDominio, NaoEncontrado, PermissaoNegada, RegraViolada } from './erros';
export {
  ehAdminGrupo,
  exigir,
  hoteisComoImplantador,
  podeAtivarHotel,
  podeConcederPapel,
  podeRevogarPapel,
  rotulo,
  vigente,
} from './permissoes';
export type { Resultado } from './permissoes';
export { PAPEIS } from './tipos';
export type { Atribuicao, Contexto, Escopo, Papel, PedidoDeConcessao } from './tipos';
