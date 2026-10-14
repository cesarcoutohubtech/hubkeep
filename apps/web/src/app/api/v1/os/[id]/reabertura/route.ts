// POST /api/v1/os/{id}/reabertura — reabre a OS concluída, com motivo: a
// mesma OS e o chamado voltam à execução. Quem abriu o chamado ou o Gerente
// do hotel (C6; ADR-029). Com paradoDesde, abre a parada do ativo no mesmo
// chamado.
import { PedidoDeReaberturaDeOs, RespostaDeReaberturaDeOs } from '@hubkeep/contratos';
import { casosDeUsoDeTriagem } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/reabertura\/?$/i;

export const POST = rota('os.reabrir', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  const pedido = await r.corpo(PedidoDeReaberturaDeOs);
  const gravado = await (await casosDeUsoDeTriagem()).reabrirOs(ctx, id, pedido);
  return r.responder(200, RespostaDeReaberturaDeOs, {
    id,
    ...gravado,
    // A preventiva não tem chamado (PV3c): a versão do chamado fica de fora.
    versaoDoChamado: gravado.versaoDoChamado ?? undefined,
  });
});
