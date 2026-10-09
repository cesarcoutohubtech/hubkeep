// POST /api/v1/os/{id}/aceite — aceita a OS concluída; o chamado fica
// concluído. Quem abriu o chamado ou o Gerente do hotel (C6; ADR-029), com o
// custo informado, opcional (I4).
import { PedidoDeAceiteDeOs, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/aceite\/?$/i;

export const POST = rota('os.aceitar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeAceiteDeOs);
  const gravado = await (await casosDeUsoDeTriagem()).aceitarOs(ctx, id, pedido);
  return r.responder(200, RespostaDeOsGravada, { id, ...gravado });
});
