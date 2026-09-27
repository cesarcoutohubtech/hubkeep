// GET /api/v1/hoteis/{id}/implantacao — painel de implantação do hotel (A5):
// locais, papéis vigentes e pendências. Admin do grupo ou Implantador do hotel.
import { RespostaDeImplantacao } from '@hubkeep/contratos';
import { casosDeUsoDeImplantacao } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/implantacao\/?$/i;

export const GET = rota('hoteis.implantacao', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  return r.responder(
    200,
    RespostaDeImplantacao,
    await (await casosDeUsoDeImplantacao()).painel(ctx, id),
  );
});
