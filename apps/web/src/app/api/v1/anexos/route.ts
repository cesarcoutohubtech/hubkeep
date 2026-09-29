// POST /api/v1/anexos — registra o arquivo enviado com a URL de upload (e a
// miniatura gerada no aparelho), na unit of work, com auditoria (B4, ADR-024).
import { PedidoDeRegistroDeAnexo, RespostaDeAnexoRegistrado } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('anexos.registrar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeRegistroDeAnexo);
  const { id } = await (await casosDeUsoDeAnexos()).registrar(ctx, pedido);
  return r.responder(201, RespostaDeAnexoRegistrado, { id });
});
