// GET /api/v1/inicio/proprietario — o cartão "UHs acompanhadas" da tela
// inicial (1c, seção 4 da paridade): só para o proprietário, com as UHs ativas
// de cada hotel a que ele está ligado por UHs.
import { RespostaDoInicioDoProprietario } from '@hubkeep/contratos';
import { casosDeUsoDoInicioDoProprietario } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('inicio.proprietario', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDoInicioDoProprietario,
    await (await casosDeUsoDoInicioDoProprietario()).consultar(ctx),
  );
});
