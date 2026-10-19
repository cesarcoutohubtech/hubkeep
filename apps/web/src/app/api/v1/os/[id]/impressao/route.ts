// GET /api/v1/os/{id}/impressao — a OS para imprimir (1c, item 9): a mesma da
// página da OS, com a descrição do chamado e o aceite no papel, e sem o custo
// informado para quem só enxerga o hotel como proprietário
// (servidor/leituras-da-os.ts).
import { RespostaDaImpressaoDaOs } from '@hubkeep/contratos';
import { ErroHttp, rota } from '../../../../../../servidor/http';
import { impressaoDaOs } from '../../../../../../servidor/leituras-da-os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/impressao\/?$/i;

export const GET = rota('os.impressao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  return r.responder(200, RespostaDaImpressaoDaOs, await impressaoDaOs(ctx, id));
});
