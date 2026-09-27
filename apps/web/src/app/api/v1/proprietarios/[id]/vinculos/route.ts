// POST /api/v1/proprietarios/{id}/vinculos — vincula o proprietário a uma UH ou
// a um hotel inteiro, com vigência (A4; ADR-031). Só o Admin do grupo.
import { PedidoDeVinculoDeProprietario, RespostaDeVinculoDeProprietario } from '@hubkeep/contratos';
import { casosDeUsoDeProprietarios } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/proprietarios\/([0-9a-f-]{36})\/vinculos\/?$/i;

export const POST = rota('proprietarios.vincular', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'proprietario_nao_encontrado');
  const pedido = await r.corpo(PedidoDeVinculoDeProprietario);
  const vigencia = { inicio: pedido.vigenciaInicio, fim: pedido.vigenciaFim };
  const alvo =
    pedido.tipo === 'uh'
      ? { tipo: 'uh' as const, localId: pedido.localId }
      : { tipo: 'hotel' as const, hotelId: pedido.hotelId };
  const resultado = await (await casosDeUsoDeProprietarios()).vincular(ctx, id, alvo, vigencia);
  return r.responder(201, RespostaDeVinculoDeProprietario, resultado);
});
