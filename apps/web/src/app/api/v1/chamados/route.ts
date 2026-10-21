// POST /api/v1/chamados — abre um chamado (C2). A prioridade e a situação
// saem do servidor; a foto vai depois, como anexo do chamado.
// GET /api/v1/chamados — lista os chamados no escopo de quem pede (C7), com os
// filtros básicos e 50 por página; com exportacao=1, 1.000 por página, que a
// tela junta no CSV (1c, item 9).
import {
  ConsultaDaListaDeChamados,
  ESTADOS_DO_CHAMADO_API,
  PedidoDeAberturaDeChamado,
  RespostaDeChamadoAberto,
  RespostaDeListaDeChamados,
} from '@hubkeep/contratos';
import { casosDeUsoDeChamados, casosDeUsoDeConsultas } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('chamados.abrir', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeAberturaDeChamado);
  const aberto = await (await casosDeUsoDeChamados()).abrir(ctx, pedido);
  return r.responder(201, RespostaDeChamadoAberto, aberto);
});

export const GET = rota('chamados.listar', async (r) => {
  const ctx = await r.contexto();
  const { exportacao, ...filtros } = r.consulta(ConsultaDaListaDeChamados);
  const pagina = await (
    await casosDeUsoDeConsultas()
  ).listarChamados(ctx, { ...filtros, exportacao: exportacao === '1' });
  return r.responder(200, RespostaDeListaDeChamados, {
    chamados: pagina.itens.map((c) => ({
      ...c,
      estado: c.estado as (typeof ESTADOS_DO_CHAMADO_API)[number],
      criadoEm: c.criadoEm.toISOString(),
    })),
    proximo: pagina.proximo,
  });
});
