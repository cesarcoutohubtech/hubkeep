// POST /api/v1/codigos-de-manutencao/padrao — instala os códigos padrão do
// catálogo que o tenant ainda não tem (I6). A falha de uma categoria padrão
// entra só se o tenant tiver a categoria. Idempotente. Só o Admin do grupo.
import { RespostaDeCodigosPadrao } from '@hubkeep/contratos';
import { casosDeUsoDeCodigos } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('codigos.instalar_padrao', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeCodigosPadrao,
    await (await casosDeUsoDeCodigos()).instalarCodigosPadrao(ctx),
  );
});
