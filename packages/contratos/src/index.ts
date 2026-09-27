// @hubkeep/contratos — schemas Zod da API /api/v1 e o OpenAPI gerado deles.
// O contrato do adaptador de sistema hoteleiro entra na F0-08.
export {
  HotelVisivel,
  PAPEIS_API,
  PedidoDeConvite,
  RespostaDeConvite,
  RespostaDeHoteis,
  RespostaDeSessao,
  STATUS_HOTEL_API,
} from './api';
export {
  ENTIDADES_EXTERNAS,
  FONTES,
  LIMITE_BYTES_LOTE,
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
  CHAVES_DE_POLITICA_API,
  FORMATOS_DE_POLITICA_API,
  PedidoDeConfiguracaoDoHotel,
  PedidoDeConfiguracaoDoTenant,
  PedidoDePolitica,
  RespostaDeConfiguracao,
} from './configuracao';
export {
  ENTIDADES_COM_ANEXO_API,
  PedidoDeUrlDeDownload,
  PedidoDeUrlDeUpload,
  RespostaDeUrlDeDownload,
  RespostaDeUrlDeUpload,
  TIPOS_DE_ANEXO_API,
} from './anexos';
export { PENDENCIAS_DE_IMPLANTACAO_API, RespostaDeImplantacao } from './implantacao';
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
export { ROTAS, type Rota, gerarOpenApi } from './openapi';
export { z } from 'zod';
