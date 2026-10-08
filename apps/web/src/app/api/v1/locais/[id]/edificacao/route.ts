// PUT /api/v1/locais/{id}/edificacao — altera só a edificação (torre, bloco) do
// local, inclusive da UH do sistema hoteleiro, que o conector não sobrescreve
// (I2). null apaga. Os mesmos papéis que gerem os locais do hotel.
import { PedidoDeEdificacao, RespostaDeLocalAlterado } from '@hubkeep/contratos';
import { casosDeUsoDeLocais } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/locais\/([0-9a-f-]{36})\/edificacao\/?$/i;

export const PUT = rota('locais.alterar_edificacao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'local_nao_encontrado');
  const { edificacao } = await r.corpo(PedidoDeEdificacao);
  await (await casosDeUsoDeLocais()).alterarEdificacao(ctx, id, edificacao);
  return r.responder(200, RespostaDeLocalAlterado, { id });
});
