// GET /api/v1/ativos/{id}/paradas — paradas do ativo (C5), da mais nova para
// a mais antiga, com o tempo parado calculado no domínio. Lê quem lê o ativo
// (RLS), inclusive o proprietário da UH.
import { RespostaDeParadasDoAtivo } from '@hubkeep/contratos';
import { casosDeUsoDeParadas } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/paradas\/?$/i;

export const GET = rota('paradas.listar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const { paradas, tempoParadoMs } = await (await casosDeUsoDeParadas()).doAtivo(ctx, id);
  return r.responder(200, RespostaDeParadasDoAtivo, {
    paradas: paradas.map((p) => ({
      id: p.id,
      ativoId: p.ativoId,
      chamadoId: p.chamadoId,
      osId: p.osId,
      inicio: p.inicio.toISOString(),
      fim: p.fim?.toISOString() ?? null,
      abertaPor: p.abertaPor,
      encerradaPor: p.encerradaPor,
      tempoParadoMs: p.tempoParadoMs,
    })),
    tempoParadoMs,
  });
});
