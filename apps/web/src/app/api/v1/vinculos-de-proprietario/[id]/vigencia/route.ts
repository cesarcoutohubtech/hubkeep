// PUT /api/v1/vinculos-de-proprietario/{id}/vigencia — altera ou encerra a
// vigência do vínculo (A4; ADR-031). Só o Admin do grupo.
import { PedidoDeVigenciaDoVinculo, RespostaDeVinculoDeProprietario } from '@hubkeep/contratos';
import { casosDeUsoDeProprietarios } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/vinculos-de-proprietario\/([0-9a-f-]{36})\/vigencia\/?$/i;

export const PUT = rota('proprietarios.alterar_vigencia', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'vinculo_nao_encontrado');
  const { tipo, vigenciaInicio, vigenciaFim } = await r.corpo(PedidoDeVigenciaDoVinculo);
  await (
    await casosDeUsoDeProprietarios()
  ).alterarVigencia(ctx, tipo, id, {
    inicio: vigenciaInicio,
    fim: vigenciaFim,
  });
  return r.responder(200, RespostaDeVinculoDeProprietario, { id });
});
