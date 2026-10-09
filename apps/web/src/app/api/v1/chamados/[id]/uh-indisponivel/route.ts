// GET e POST /api/v1/chamados/{id}/uh-indisponivel — os períodos em que a UH
// do chamado ficou indisponível, com o tempo calculado no domínio, e a
// marcação depois da abertura, pela gestão do hotel; sem início, agora (I4).
// O proprietário recebe só a UH, o estado e as datas.
import {
  PedidoDeUhIndisponivel,
  RespostaDeUhIndisponivel,
  RespostaDeUhMarcada,
} from '@hubkeep/contratos';
import { casosDeUsoDeUhIndisponivel } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/uh-indisponivel\/?$/i;

export const GET = rota('uh_indisponivel.listar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const periodos = await (await casosDeUsoDeUhIndisponivel()).doChamado(ctx, id);
  return r.responder(200, RespostaDeUhIndisponivel, {
    periodos: periodos.map((p) => ({
      id: p.id,
      localId: p.localId,
      inicio: p.inicio.toISOString(),
      fim: p.fim?.toISOString() ?? null,
      tempoIndisponivelMs: p.tempoIndisponivelMs,
      ...('chamadoId' in p
        ? { chamadoId: p.chamadoId, abertaPor: p.abertaPor, encerradaPor: p.encerradaPor }
        : {}),
    })),
  });
});

export const POST = rota('uh_indisponivel.marcar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const pedido = await r.corpo(PedidoDeUhIndisponivel);
  const marcado = await (
    await casosDeUsoDeUhIndisponivel()
  ).marcar(ctx, id, { desde: pedido.desde ? new Date(pedido.desde) : null });
  return r.responder(201, RespostaDeUhMarcada, marcado);
});
