// GET /api/v1/modelos-de-checklist — modelos de checklist do grupo, inclusive
// os desativados (PV1, ADR-040). Leem a gestão e o Implantador.
// POST /api/v1/modelos-de-checklist — cria um modelo, com a bandeira (PB1b). Só
// o Admin do grupo.
import {
  PedidoDeCriacaoDeModeloDeChecklist,
  RespostaDeModeloDeChecklistAlterado,
  RespostaDeModelosDeChecklist,
} from '@hubkeep/contratos';
import { casosDeUsoDeChecklists } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('checklists.listar', async (r) => {
  const ctx = await r.contexto();
  return r.responder(
    200,
    RespostaDeModelosDeChecklist,
    await (await casosDeUsoDeChecklists()).listarModelos(ctx),
  );
});

export const POST = rota('checklists.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeCriacaoDeModeloDeChecklist);
  const { id } = await (await casosDeUsoDeChecklists()).criarModelo(ctx, pedido);
  return r.responder(201, RespostaDeModeloDeChecklistAlterado, { id, versao: 1 });
});
