// POST /api/v1/hoteis/{id}/importacao-de-ativos/previa — a prévia da planilha de ativos, sem gravar (M2).
import {
  LIMITE_DO_CORPO_DA_IMPORTACAO,
  PedidoDeImportacaoDeAtivos,
  RespostaDaPreviaDaImportacao,
} from '@hubkeep/contratos';
import { casosDeUsoDeImportacaoDeAtivos } from '../../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/importacao-de-ativos\/previa\/?$/i;

export const POST = rota('importacao_de_ativos.prever', async (r) => {
  const ctx = await r.contexto();
  const hotelId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!hotelId) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const { csv } = await r.corpo(PedidoDeImportacaoDeAtivos, {
    limiteBytes: LIMITE_DO_CORPO_DA_IMPORTACAO,
  });
  const previa = await (await casosDeUsoDeImportacaoDeAtivos()).prever(ctx, hotelId, csv);
  return r.responder(200, RespostaDaPreviaDaImportacao, {
    ...previa,
    linhas: previa.linhas.map((l) => ({
      numero: l.numero,
      situacao: l.situacao,
      nome: l.nome,
      erros: l.erros,
    })),
  });
});
