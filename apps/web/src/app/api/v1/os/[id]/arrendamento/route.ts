// POST /api/v1/os/{id}/arrendamento — ajusta quem responde pela OS do hotel
// arrendado (a arrendatária ou o locador), com motivo, até o aceite, na versão
// vista (1c, ADR-045). Só os papéis da triagem. O primeiro ajuste para o
// locador grava o aviso, uma vez por OS.
import { PedidoDeArrendamentoDaOs, RespostaDeOsGravada } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/arrendamento\/?$/i;

export const POST = rota('os.ajustar_arrendamento', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeArrendamentoDaOs);
  const gravado = await (await casosDeUsoDeTriagem()).ajustarArrendamento(ctx, id, pedido);
  return r.responder(200, RespostaDeOsGravada, { id, ...gravado });
});
