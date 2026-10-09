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
  AnexoGravado,
  ArmazenamentoDeArquivos,
  DadosDeAnexo,
  EntidadeComAnexo,
  PortaAnexos,
  PortaEscopoDeAnexo,
} from './portas/anexos';
export {
  SEGUNDOS_URL_DE_DOWNLOAD,
  TIPOS_DE_ANEXO,
  criarCasosDeUsoDeAnexos,
} from './casos-de-uso/anexos';
export type {
  AnexoListado,
  CasosDeUsoDeAnexos,
  DependenciasDeAnexos,
  PedidoDeRegistroDeAnexo,
  TipoDeAnexo,
} from './casos-de-uso/anexos';
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
  LocalDoHotel,
  PortaProprietarios,
  Proprietario,
  TipoDeVinculo,
  VinculoDeProprietario,
} from './portas/proprietarios';
export { criarCasosDeUsoDeProprietarios } from './casos-de-uso/proprietarios';
export type {
  AlvoDoVinculo,
  CasosDeUsoDeProprietarios,
  ProprietarioComVinculos,
} from './casos-de-uso/proprietarios';
export type {
  ConfiguracaoDoHotel,
  ConfiguracaoDoTenant,
  EscopoDePolitica,
  MudancaDaConfiguracaoDoHotel,
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
export type {
  FornecedorCadastrado,
  MudancaDeFornecedor,
  PortaFornecedores,
} from './portas/fornecedores';
export { criarCasosDeUsoDeFornecedores } from './casos-de-uso/fornecedores';
export type { CasosDeUsoDeFornecedores, PedidoDeFornecedor } from './casos-de-uso/fornecedores';
export type { MembroComAtribuicoes, PortaMembros } from './portas/membros';
export type {
  AtivoGravado,
  DadosDeAtivo,
  MovimentacaoDeAtivo,
  MudancaDeAtivo,
  PortaAtivos,
} from './portas/ativos';
export { criarCasosDeUsoDeAtivos } from './casos-de-uso/ativos';
export type {
  AlteracaoPreparada,
  AtivoListado,
  CadastroPreparado,
  CasosDeUsoDeAtivos,
  PedidoDeAlteracaoDeAtivo,
  PedidoDeCadastroDeAtivo,
  PedidoDeGravacaoDeAtivo,
  PedidoDeMovimentacaoDeAtivo,
} from './casos-de-uso/ativos';
export type { CategoriaGravada, PortaCategorias } from './portas/categorias';
export { criarCasosDeUsoDeCategorias } from './casos-de-uso/categorias';
export type { CasosDeUsoDeCategorias, CategoriaDeAtivo } from './casos-de-uso/categorias';
export type {
  PortaPrioridades,
  PortaSituacoes,
  PrioridadeGravada,
  SituacaoGravada,
} from './portas/situacoes';
export { criarCasosDeUsoDeSituacoes } from './casos-de-uso/situacoes';
export type { ChamadoGravado, DadosDeChamado, PortaChamados } from './portas/chamados';
export { criarCasosDeUsoDeChamados } from './casos-de-uso/chamados';
export type { CasosDeUsoDeChamados, PedidoDeAberturaDeChamado } from './casos-de-uso/chamados';
export type {
  ChamadoParaTriagem,
  MudancaNoChamado,
  OsGravada,
  PortaTriagem,
  ReflexoNoChamado,
} from './portas/triagem';
export { criarCasosDeUsoDeTriagem } from './casos-de-uso/triagem';
export type { AcaoNaOsDecidida, OsDoDia, PortaExecucao } from './portas/execucao';
export { criarCasosDeUsoDeExecucao } from './casos-de-uso/execucao';
export type { AcaoDoTecnico, CasosDeUsoDeExecucao } from './casos-de-uso/execucao';
export type {
  EncerramentoDeParada,
  ParadaGravada,
  ParadaPendente,
  PortaParadas,
  RegistroDeParada,
} from './portas/paradas';
export { criarCasosDeUsoDeParadas } from './casos-de-uso/paradas';
export type {
  LiberacaoDeUh,
  MarcacaoDeUh,
  PeriodoDeUhGravado,
  PortaUhIndisponivel,
} from './portas/uh-indisponivel';
export { criarCasosDeUsoDeUhIndisponivel } from './casos-de-uso/uh-indisponivel';
export type {
  CasosDeUsoDeUhIndisponivel,
  PeriodoDeUhComTempo,
  PeriodoDeUhVisto,
} from './casos-de-uso/uh-indisponivel';
export type {
  CasosDeUsoDeParadas,
  ParadaComTempo,
  ParadaPendenteComTempo,
  ParadaVista,
} from './casos-de-uso/paradas';
export type {
  ChamadoResumido,
  EventoDaLinhaDoTempo,
  NomesDoChamado,
  OsResumida,
  PortaConsultasDaCorretiva,
} from './portas/consultas';
export { criarCasosDeUsoDeConsultas } from './casos-de-uso/consultas';
export type { CasosDeUsoDeConsultas, Pagina, PedidoDeLista } from './casos-de-uso/consultas';
export type {
  CasosDeUsoDeTriagem,
  ExecucaoPedida,
  RegrasDaTriagem,
  ResponsavelPedido,
} from './casos-de-uso/triagem';
export type { CasosDeUsoDeSituacoes, Prioridade, Situacao } from './casos-de-uso/situacoes';
export type {
  LocalDoHotel as LocalDoHotelCadastrado,
  MudancaDeLocal,
  PortaLocais,
} from './portas/locais';
export { criarCasosDeUsoDeLocais } from './casos-de-uso/locais';
export type { CasosDeUsoDeLocais, LocalListado } from './casos-de-uso/locais';
export type { HotelEmImplantacao, PortaImplantacao } from './portas/implantacao';
export { criarCasosDeUsoDeImplantacao } from './casos-de-uso/implantacao';
export type { CasosDeUsoDeImplantacao } from './casos-de-uso/implantacao';
export { REGRAS_DE_MEMBROS, criarCasosDeUsoDeMembros } from './casos-de-uso/membros';
export type { CasosDeUsoDeMembros, RegrasDeMembros } from './casos-de-uso/membros';
export { termoDeBusca, textoDeBusca } from './busca';
export type { LinhaDeAuditoria, PortaHistorico, ReferenciaDoHistorico } from './portas/historico';
export { criarCasosDeUsoDeHistorico } from './casos-de-uso/historico';
export type {
  CasosDeUsoDeHistorico,
  EventoDoHistorico,
  HistoricoDoRegistro,
} from './casos-de-uso/historico';
