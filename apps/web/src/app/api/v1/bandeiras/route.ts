// GET e POST /api/v1/bandeiras — lista e criação de bandeiras (A2).
import {
  PedidoDeBandeira,
  RespostaDeBandeiraCriada,
  RespostaDeBandeiras,
} from '@hubkeep/contratos';
import { casosDeUsoDeBandeiras } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('bandeiras.listar', async (r) => {
  const ctx = await r.contexto();
  const bandeiras = await (await casosDeUsoDeBandeiras()).listarBandeiras(ctx);
  return r.responder(200, RespostaDeBandeiras, { bandeiras });
});

export const POST = rota('bandeiras.criar', async (r) => {
  const ctx = await r.contexto();
  const { nome } = await r.corpo(PedidoDeBandeira);
  const criada = await (await casosDeUsoDeBandeiras()).criarBandeira(ctx, nome);
  return r.responder(201, RespostaDeBandeiraCriada, criada);
});
