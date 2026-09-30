// @hubkeep/contratos — schemas Zod da API /api/v1 e o OpenAPI gerado deles.
// O contrato do adaptador de sistema hoteleiro entra na F0-08.
export {
  HotelVisivel,
  LIMITE_MINIMO_DA_SENHA,
  PAPEIS_API,
  PedidoDeConvite,
  PedidoDeSenha,
  PedidoDeSessao,
  RespostaDeConvite,
  RespostaDeHoteis,
  RespostaDeSessao,
  STATUS_HOTEL_API,
} from './api';
export {
  ENTIDADES_EXTERNAS,
  FONTES,
  LIMITE_BYTES_LOTE,
  LIMITE_BYTES_MAXIMO,
  LIMITE_BYTES_PADRAO,
  LIMITE_REGISTROS_LOTE,
  DadosDeHotel,
  DadosDeUh,
  LoteDeIngestao,
  RegistroExterno,
  RespostaDeLote,
  type AdaptadorDeSistemaHoteleiro,
  type EntidadeExterna,
  type Fonte,
} from './ingestao';
export { PedidoDeCredencial, RespostaDeCredencial, RespostaDeRevogacao } from './credenciais';
export {
  CATEGORIAS_PADRAO_API,
  CategoriaApi,
  DefinicaoDeCampoApi,
  PedidoDeCategoria,
  RespostaDeCategoriaAlterada,
  RespostaDeCategorias,
  RespostaDeCategoriasPadrao,
  TIPOS_DE_CAMPO_API,
} from './categorias';
export {
  ACOES_DA_OS_API,
  ACOES_DO_CHAMADO_API,
  ENTIDADES_COM_SITUACAO_API,
  ESTADOS_DA_OS_API,
  ESTADOS_DO_CHAMADO_API,
  PRIORIDADES_PADRAO_API,
  PedidoDePrioridade,
  PedidoDeSituacao,
  PedidoDeSituacaoNova,
  PrioridadeApi,
  RespostaDeConfiguracaoAlterada,
  RespostaDeSituacoesEPrioridades,
  RespostaDeSituacoesEPrioridadesPadrao,
  SituacaoApi,
} from './situacoes';
export {
  ChamadoApi,
  OsApi,
  OsDoDiaApi,
  RespostaDeOsDoDia,
  PedidoDeAberturaDeChamado,
  PedidoDeAjusteDePrioridade,
  PedidoDeAtribuicaoDeOs,
  PedidoDeCancelamento,
  PedidoDeTriagem,
  ResponsavelApi,
  RespostaDeChamado,
  RespostaDeChamadoAberto,
  RespostaDeChamadoAlterado,
  RespostaDeOsGravada,
} from './chamados';
export {
  AtivoApi,
  PedidoDeAlteracaoDeAtivo,
  MovimentacaoDeAtivoApi,
  PedidoDeCadastroDeAtivo,
  PedidoDeMovimentacaoDeAtivo,
  PedidoDeVersaoDeAtivo,
  RespostaDeAtivoDoQr,
  RespostaDeAtivoGravado,
  RespostaDeAtivosDoHotel,
  RespostaDeMovimentacoesDoAtivo,
  ValoresDeCampoApi,
} from './ativos';
export {
  LocalApi,
  PedidoDeAreaComum,
  RespostaDeLocaisDoHotel,
  RespostaDeLocalAlterado,
  STATUS_DE_LOCAL_API,
  TIPOS_DE_LOCAL_API,
} from './locais';
export {
  CHAVES_DE_POLITICA_API,
  FORMATOS_DE_POLITICA_API,
  PedidoDeConfiguracaoDoHotel,
  PedidoDeConfiguracaoDoTenant,
  PedidoDePolitica,
  RespostaDeConfiguracao,
} from './configuracao';
export {
  AnexoApi,
  ENTIDADES_COM_ANEXO_API,
  PedidoDeRegistroDeAnexo,
  PedidoDeUrlDeDownload,
  PedidoDeUrlDeUpload,
  PedidoDeUrlDoAnexo,
  RespostaDeAnexoRegistrado,
  RespostaDeAnexoRemovido,
  RespostaDeAnexos,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
  TIPOS_DE_ANEXO_API,
} from './anexos';
export { PENDENCIAS_DE_IMPLANTACAO_API, RespostaDeImplantacao } from './implantacao';
export {
  PedidoDeProprietario,
  PedidoDeVigenciaDoVinculo,
  PedidoDeVinculoDeProprietario,
  RespostaDeProprietarioAlterado,
  RespostaDeProprietarios,
  RespostaDeVinculoDeProprietario,
  VinculoDeProprietarioApi,
} from './proprietarios';
export {
  PedidoDeOperacaoOffline,
  RespostaDeOperacaoOffline,
  TIPOS_DE_OPERACAO_OFFLINE,
} from './sincronizacao';
export {
  HotelParaAtivacao,
  PedidoDeImportacaoDeHotel,
  RespostaDeAtivacaoDeHotel,
  RespostaDeHoteisDoStaging,
  RespostaDeImportacaoDeHotel,
} from './hoteis';
export {
  AtribuicaoApi,
  EscopoApi,
  PedidoDeConcessaoDePapel,
  PedidoDeValidade,
  RespostaDeAtivoDoMembro,
  RespostaDeConcessaoDePapel,
  RespostaDeMembros,
  RespostaDeRevogacaoDePapel,
  RespostaDeValidade,
} from './membros';
export {
  EquipeApi,
  PedidoDeEquipe,
  PedidoDeMembroDaEquipe,
  RespostaDeEquipeAlterada,
  RespostaDeEquipes,
  RespostaDeMembroDaEquipe,
} from './equipes';
export { IDIOMAS_API, PedidoDePreferencias, RespostaDePreferencias } from './preferencias';
export {
  BandeiraApi,
  PedidoDeBandeira,
  PedidoDeBandeiraDoHotel,
  RespostaDeBandeiraAlterada,
  RespostaDeBandeiraCriada,
  RespostaDeBandeiraDoHotel,
  RespostaDeBandeiras,
} from './bandeiras';
export { CODIGOS_HTTP, ErroApi, type ProblemaDeEntrada, problemasDe } from './erro';
export {
  ParadaApi,
  ParadaPendenteApi,
  PedidoDeEncerramentoDeParada,
  RespostaDeParadaEncerrada,
  RespostaDeParadasDoAtivo,
  RespostaDeParadasPendentes,
} from './paradas';
export { ROTAS, type Rota, gerarOpenApi } from './openapi';
export { z } from 'zod';
