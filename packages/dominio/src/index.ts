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
  CRITICIDADE_MAXIMA,
  LIMITES_DE_ATIVO,
  NIVEIS_DE_CRITICIDADE,
  PAPEIS_QUE_GERENCIAM_ATIVOS,
  conflitoDeVersao,
  ehCriticidade,
  ehDataDeCalendario,
  exigirLocalParaAtivo,
  normalizarNomeDeAtivo,
  normalizarTextoDoAtivo,
  podeGerirAtivos,
  podeMoverAtivo,
  validarCamposDoAtivo,
  validarCriticidade,
  validarDatasDoAtivo,
  validarMovimentacao,
} from './ativos';
export type {
  CampoDeDataDoAtivo,
  CampoDeTextoDoAtivo,
  CategoriaParaAtivo,
  Criticidade,
} from './ativos';
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
  LIMITE_EDIFICACAO,
  PAPEIS_QUE_GERENCIAM_LOCAIS,
  edificacoesDoHotel,
  exigirLocalEditavel,
  localEditavel,
  mesmoNomeDeLocal,
  normalizarAndar,
  normalizarEdificacao,
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
  PREFIXOS_DO_NUCLEO,
  POLITICAS,
  ehChaveDePolitica,
  registroDePoliticas,
  registrosDePoliticasPorModulo,
  podeGerirPoliticas,
  resolverPolitica,
  validarPolitica,
  validarRegiao,
} from './politicas';
export type {
  AceiteAutomatico,
  ChaveDePolitica,
  CodigosObrigatorios,
  ExtensaoDeModulo,
  ExtensaoDePolitica,
  NiveisDePolitica,
  NomesDeCriticidade,
  PrioridadePadraoPorCategoria,
  RegistroDePoliticas,
  RegistrosDePoliticas,
  ValoresDePolitica,
} from './politicas';
export {
  PAPEIS_QUE_GERENCIAM_EQUIPES,
  escopoCobreHotel,
  normalizarNomeDeEquipe,
  podeGerirEquipes,
} from './equipes';
export { normalizarNomeDeBandeira, podeGerirBandeiras, podeLigarHotelABandeira } from './bandeiras';
export {
  LIMITES_DE_FORNECEDOR,
  PAPEIS_QUE_GERENCIAM_FORNECEDORES,
  cnpjDeFornecedorRepetido,
  cnpjValido,
  formatarCnpj,
  normalizarContatoDeFornecedor,
  normalizarNomeDeFornecedor,
  podeGerirFornecedores,
  validarCnpj,
  validarDadosDeFornecedor,
} from './fornecedores';
export type { ContatoDeFornecedor, DadosDeFornecedor } from './fornecedores';
export { MODELOS_CONTRATUAIS, ehModeloContratual, validarModeloContratual } from './hoteis';
export type { ModeloContratual } from './hoteis';
export { PENDENCIAS_DE_IMPLANTACAO, podeVerImplantacao, resumirImplantacao } from './implantacao';
export type {
  AtivoParaImplantacao,
  HotelParaImplantacao,
  LocalParaImplantacao,
  PendenciaDeImplantacao,
  PessoaParaImplantacao,
  ResumoDeImplantacao,
} from './implantacao';
export { podeAlterarAtivoDoMembro, podeAlterarValidade, podeGerirMembros } from './membros';
export {
  MODULOS_CONTRATAVEIS,
  contaComoHotel,
  contaComoUh,
  decidirAtivacao,
  ehModuloContratavel,
  moduloVigente,
  modulosVigentes,
  saldoDeHoteis,
  saldoDeUhs,
  statusDaUhNova,
  vigenciaDeModuloValida,
} from './licenca';
export type {
  DecisaoDeAtivacao,
  ModuloContratado,
  ModuloContratavel,
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
  PAPEIS_DO_ACEITE_SEM_GERENTE,
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
  ESTADOS_DA_OS_CONCLUIDA,
  encerraParadaNoHotel,
  podeAbrirChamado,
  podeEncerrarParada,
  podeGerirUhIndisponivel,
  podeListarParadasPendentes,
  podeTriar,
  veDetalhesDaParada,
} from './corretiva';
export type {
  AcaoDaOs,
  AcaoDoChamado,
  AtorDaCorretiva,
  ChamadoParaRegra,
  DadosDoAceite,
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
  horaDaTransicao,
  validarApontamento,
} from './execucao';
export {
  exigirAtivoNoChamado,
  exigirParadaAberta,
  exigirSemParadaAberta,
  paradaAEncerrarNaConclusao,
  tempoParado,
  tempoParadoTotal,
  validarFimDaParada,
  validarParada,
} from './paradas';
export type { Parada } from './paradas';
export {
  ESTADOS_QUE_ACEITAM_UH_INDISPONIVEL,
  exigirChamadoQueAceitaUhIndisponivel,
  exigirPeriodoAberto,
  exigirSemPeriodoAberto,
  exigirUhParaIndisponibilidade,
  periodoALiberarNaConclusao,
  uhDiasPerdidos,
  validarFimDaIndisponibilidade,
  validarInicioDaIndisponibilidade,
} from './uh-indisponivel';
export type { PeriodoDeUh, PeriodoDeUhIndisponivel } from './uh-indisponivel';
export {
  CUSTO_MAXIMO,
  ESTADOS_COM_EXECUTOR_AJUSTAVEL,
  EXECUCAO_PADRAO,
  EXECUTORES_DA_OS,
  decidirQuemExecuta,
  ehExecutorDaOs,
  normalizarCustoInformado,
} from './executor-e-custo';
export type { ExecutadoPor, QuemExecuta } from './executor-e-custo';
export {
  CODIGOS_PADRAO,
  LIMITE_DO_NOME_DE_CODIGO,
  SEM_CODIGOS,
  TIPOS_DE_CODIGO_DE_MANUTENCAO,
  codigoServe,
  codigosQueServem,
  ehTipoDeCodigoDeManutencao,
  exigirCodigosNoAceite,
  podeGerirCodigos,
  sugestaoDosCodigos,
  validarCodigosDaOs,
  validarNomesDeCodigo,
  validarTipoDeCodigo,
} from './codigos-manutencao';
export type {
  CodigoPadrao,
  CodigoParaRegra,
  CodigosDaOs,
  CodigosSugeridos,
  TipoDeCodigoDeManutencao,
} from './codigos-manutencao';
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
  ORIGEM_PADRAO_DO_CHAMADO,
  ORIGENS_DO_CHAMADO,
  exigirAtivoDoChamado,
  exigirLocalParaChamado,
  normalizarDescricaoDoChamado,
  politicaAplicadaNaAbertura,
} from './chamados';
export type { OrigemDoChamado, PoliticaAplicadaNaAbertura } from './chamados';
export {
  ENTIDADES_DA_LINHA_DO_TEMPO,
  TAMANHO_DA_PAGINA,
  motivoDaAuditoria,
  validarPeriodoDaLista,
} from './consultas';
export type { EntidadeDaLinhaDoTempo, FiltroDaLista } from './consultas';
export {
  ESTADOS_COM_IMPACTO_AJUSTAVEL,
  ESTADOS_COM_PRIORIDADE_AJUSTAVEL,
  exigirPrioridadeAtiva,
  exigirResponsavelDoHotel,
  podeAjustarPrioridade,
  podeAjustarQuemExecuta,
  podeInformarImpacto,
} from './triagem';
export type { CandidatoAResponsavel } from './triagem';
export { PAPEIS } from './tipos';
export type { Atribuicao, Contexto, Escopo, Papel, PedidoDeConcessao } from './tipos';
export {
  ACOES_SEM_DETALHE,
  CAMPOS_FORA_DO_HISTORICO,
  ENTIDADES_COM_HISTORICO,
  REFERENCIA_DO_CAMPO,
  mudancasDaAuditoria,
  mudancasVisiveis,
  referenciasDasMudancas,
} from './auditoria';
export type {
  EntidadeComHistorico,
  MudancaAuditada,
  TipoDeReferencia,
  ValorAuditado,
} from './auditoria';
