// GET /api/v1/chamados/{id} — o chamado, como a RLS o mostra a quem pede (C2).
import { RespostaDeChamado } from '@hubkeep/contratos';
import { casosDeUsoDeChamados } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('chamados.ler', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const c = await (await casosDeUsoDeChamados()).chamado(ctx, id);
  return r.responder(200, RespostaDeChamado, {
    chamado: {
      id: c.id,
      hotelId: c.hotelId,
      localId: c.localId,
      ativoId: c.ativoId,
      descricao: c.descricao,
      estado: c.estado as 'aberto',
      situacaoId: c.situacaoId,
      prioridadeId: c.prioridadeId,
      politicaAplicada: (c.politicaAplicada ?? {}) as Record<string, unknown>,
      abertoPor: c.abertoPor,
      versao: c.versao,
      criadoEm: c.criadoEm.toISOString(),
    },
  });
});
