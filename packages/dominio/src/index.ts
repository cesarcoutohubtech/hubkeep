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
export {
  PAPEIS_QUE_GERENCIAM_LOCAIS,
  exigirLocalEditavel,
  localEditavel,
  mesmoNomeDeLocal,
  normalizarAndar,
  normalizarNomeDeLocal,
  origemDoLocal,
  podeGerirLocais,
} from './locais';
export type { LocalParaRegra, OrigemDoLocal } from './locais';
export {
  diaDe,
  exigirSemSobreposicao,
  normalizarDocumento,
  normalizarNomeDeProprietario,
  podeGerirProprietarios,
  validarVigencia,
  vigenciaCobre,
  vigenciasSobrepostas,
} from './proprietarios';
export type { Vigencia } from './proprietarios';
export {
  CHAVES_DE_POLITICA,
  POLITICAS,
  ehChaveDePolitica,
  podeGerirPoliticas,
  resolverPolitica,
  validarPolitica,
  validarRegiao,
} from './politicas';
export type {
  AceiteAutomatico,
  ChaveDePolitica,
  PrioridadePadraoPorCategoria,
  ValoresDePolitica,
} from './politicas';
export {
  PAPEIS_QUE_GERENCIAM_EQUIPES,
  escopoCobreHotel,
  normalizarNomeDeEquipe,
  podeGerirEquipes,
} from './equipes';
export { normalizarNomeDeBandeira, podeGerirBandeiras, podeLigarHotelABandeira } from './bandeiras';
export { PENDENCIAS_DE_IMPLANTACAO, podeVerImplantacao, resumirImplantacao } from './implantacao';
export type {
  LocalParaImplantacao,
  PendenciaDeImplantacao,
  PessoaParaImplantacao,
  ResumoDeImplantacao,
} from './implantacao';
export { podeAlterarAtivoDoMembro, podeAlterarValidade, podeGerirMembros } from './membros';
export {
  contaComoHotel,
  contaComoUh,
  decidirAtivacao,
  saldoDeHoteis,
  saldoDeUhs,
  statusDaUhNova,
} from './licenca';
export type {
  DecisaoDeAtivacao,
  SaldoDeHoteis,
  SaldoDeUhs,
  StatusDeHotel,
  StatusDeLocal,
  TipoDeLocal,
} from './licenca';
export { PAPEIS } from './tipos';
export type { Atribuicao, Contexto, Escopo, Papel, PedidoDeConcessao } from './tipos';
