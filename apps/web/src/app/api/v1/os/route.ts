// GET /api/v1/os — lista as OS no escopo de quem pede (C7), com os filtros da
// lista de chamados (a prioridade é a do chamado) e 50 por página. Com
// doLocador=1, só as OS do locador no hotel arrendado (1c, ADR-045).
import { ConsultaDaListaDeOs, ESTADOS_DA_OS_API, RespostaDeListaDeOs } from '@hubkeep/contratos';
import { casosDeUsoDeConsultas } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('os.listar', async (r) => {
  const ctx = await r.contexto();
  const { doLocador, ...pedido } = r.consulta(ConsultaDaListaDeOs);
  const pagina = await (
    await casosDeUsoDeConsultas()
  ).listarOs(ctx, {
    ...pedido,
    doLocador: doLocador === '1',
  });
  return r.responder(200, RespostaDeListaDeOs, {
    os: pagina.itens.map((o) => ({
      ...o,
      estado: o.estado as (typeof ESTADOS_DA_OS_API)[number],
      criadoEm: o.criadoEm.toISOString(),
    })),
    proximo: pagina.proximo,
  });
});
