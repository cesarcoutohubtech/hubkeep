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
  IDIOMAS_DE_ROTULO,
  LIMITES_DE_CAMPO,
  TIPOS_DE_CAMPO,
  lerDefinicoes,
  lerValores,
  normalizarRotulos,
  validarDefinicoes,
  validarMudancaDeDefinicoes,
  validarValores,
} from './campos-tipados';
export type {
  DefinicaoDeCampo,
  IdiomaDeRotulo,
  OpcaoDeLista,
  Rotulos,
  TipoDeCampo,
  ValorDeCampo,
} from './campos-tipados';
export {
  LIMITES_DE_ATIVO,
  PAPEIS_QUE_GERENCIAM_ATIVOS,
  conflitoDeVersao,
  exigirLocalParaAtivo,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  podeGerirAtivos,
  podeMoverAtivo,
  validarCamposDoAtivo,
  validarMovimentacao,
} from './ativos';
export type { CampoDeTextoDoAtivo, CategoriaParaAtivo } from './ativos';
export {
  LIMITE_NOME_DE_ANEXO,
  TIPOS_DE_MINIATURA,
  normalizarNomeDeAnexo,
  podeRemoverAnexo,
  validarMiniatura,
} from './anexos';
export {
  CATEGORIAS_PADRAO,
  ehCategoriaPadrao,
  podeGerirCategorias,
  validarNomesDeCategoria,
} from './categorias';
export type { CategoriaPadrao } from './categorias';
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
  AtivoParaImplantacao,
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
export {
  ALFABETO_DO_QR,
  TAMANHO_DO_CODIGO_QR,
  caminhoDoQr,
  codigoQrDeBytes,
  lerCodigoQr,
} from './qr';
export {
  ACOES_DA_OS,
  ACOES_DO_CHAMADO,
  ESTADOS_DA_OS,
  ESTADOS_DO_CHAMADO,
  GRUPOS_DA_CORRETIVA,
  LIMITE_MOTIVO,
  PAPEIS_DA_ADMINISTRACAO,
  PAPEIS_DA_TRIAGEM,
  PAPEIS_QUE_ABREM_CHAMADO,
  TRANSICOES_DA_OS,
  TRANSICOES_DO_CHAMADO,
  ESTADOS_QUE_ACEITAM_REGISTRO,
  REGISTROS_NA_OS,
  decidirNaOs,
  decidirNoChamado,
  decidirRegistroNaOs,
  exigirChamadoSemOsEmAndamento,
  normalizarMotivo,
  osOcupaOChamado,
  podeAbrirChamado,
  podeEncerrarParada,
  podeTriar,
} from './corretiva';
export type {
  AcaoDaOs,
  AcaoDoChamado,
  AtorDaCorretiva,
  ChamadoParaRegra,
  EstadoDaOs,
  EstadoDoChamado,
  RegistroNaOs,
  Responsavel,
} from './corretiva';
export {
  FOLGA_DO_RELOGIO_MINUTOS,
  LIMITE_HORAS_POR_APONTAMENTO,
  LIMITE_MATERIAL,
  normalizarMaterial,
  validarApontamento,
} from './execucao';
export {
  exigirAtivoNoChamado,
  exigirParadaAberta,
  exigirSemParadaAberta,
  tempoParado,
  tempoParadoTotal,
  validarFimDaParada,
  validarParada,
} from './paradas';
export type { Parada } from './paradas';
export {
  ENTIDADES_COM_SITUACAO,
  ESTADOS_POR_ENTIDADE,
  LIMITES_DA_CONFIGURACAO,
  PRIORIDADES_PADRAO,
  SITUACOES_PADRAO,
  ehEstadoDe,
  exigirPrioridadeRestante,
  exigirSituacaoRestante,
  podeGerirPrioridades,
  podeGerirSituacoes,
  prioridadePadraoDoChamado,
  situacaoPara,
  validarCor,
  validarEstadoDaSituacao,
  validarNomesDeConfiguracao,
  validarOrdem,
  validarPeso,
} from './situacoes';
export type {
  EntidadeComSituacao,
  PrioridadePadrao,
  PrioridadeParaRegra,
  SituacaoPadrao,
  SituacaoParaRegra,
} from './situacoes';
export {
  LIMITE_DESCRICAO_DO_CHAMADO,
  exigirAtivoDoChamado,
  exigirLocalParaChamado,
  normalizarDescricaoDoChamado,
  politicaAplicadaNaAbertura,
} from './chamados';
export type { PoliticaAplicadaNaAbertura } from './chamados';
export {
  ESTADOS_COM_PRIORIDADE_AJUSTAVEL,
  exigirPrioridadeAtiva,
  exigirResponsavelDoHotel,
  podeAjustarPrioridade,
} from './triagem';
export type { CandidatoAResponsavel } from './triagem';
export { PAPEIS } from './tipos';
export type { Atribuicao, Contexto, Escopo, Papel, PedidoDeConcessao } from './tipos';
