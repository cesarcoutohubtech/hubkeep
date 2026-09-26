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
  DadosDeUh,
  LoteDeIngestao,
  RegistroExterno,
  RespostaDeLote,
  type AdaptadorDeSistemaHoteleiro,
  type EntidadeExterna,
  type Fonte,
} from './ingestao';
export { PedidoDeCredencial, RespostaDeCredencial, RespostaDeRevogacao } from './credenciais';
export { CODIGOS_HTTP, ErroApi, type ProblemaDeEntrada, problemasDe } from './erro';
export { ROTAS, type Rota, gerarOpenApi } from './openapi';
export { z } from 'zod';
