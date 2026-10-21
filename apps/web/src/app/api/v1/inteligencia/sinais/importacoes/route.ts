// POST /api/v1/inteligencia/sinais/importacoes — as linhas do CSV de
// reclamações de hóspede num hotel (ADR-047), com o resultado por linha. O
// navegador lê o arquivo e manda só as colunas do HubKeep, em partes de até
// 1 MB; o arquivo não fica guardado.
import {
  LIMITE_BYTES_DA_IMPORTACAO,
  PedidoDeImportacaoDeSinais,
  RespostaDaImportacaoDeSinais,
} from '@hubkeep/contratos';
import { casosDeUsoDoPainelDoIntelligence } from '../../../../../../servidor/composicao';
import { rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('inteligencia.sinais.importar', async (r) => {
  const ctx = await r.contexto();
  const { hotelId, linhas } = await r.corpo(PedidoDeImportacaoDeSinais, {
    limiteBytes: LIMITE_BYTES_DA_IMPORTACAO,
  });
  const resultado = await (
    await casosDeUsoDoPainelDoIntelligence()
  ).importarSinais(ctx, hotelId, linhas);
  return r.responder(200, RespostaDaImportacaoDeSinais, resultado);
});
