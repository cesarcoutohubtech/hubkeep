// GET /api/v1/os/{id}/codigos — os códigos que servem para a OS, por tipo
// (ativos, da categoria do ativo do chamado primeiro): a lista do aceite (I6).
// Quem não vê a OS recebe 404.
import { RespostaDeCodigosDaOs } from '@hubkeep/contratos';
import { casosDeUsoDeCodigos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/codigos\/?$/i;

export const GET = rota('os.codigos', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  return r.responder(
    200,
    RespostaDeCodigosDaOs,
    await (await casosDeUsoDeCodigos()).codigosParaOs(ctx, id),
  );
});
