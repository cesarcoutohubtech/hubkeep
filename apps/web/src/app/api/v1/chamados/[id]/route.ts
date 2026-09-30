// GET /api/v1/chamados/{id} — o chamado e as OS dele, como a RLS os mostra a
// quem pede (C2, C3), com os nomes que o detalhe mostra (C7).
import { ESTADOS_DA_OS_API, ESTADOS_DO_CHAMADO_API, RespostaDeChamado } from '@hubkeep/contratos';
import {
  casosDeUsoDeChamados,
  casosDeUsoDeConsultas,
  casosDeUsoDeTriagem,
} from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/chamados\/([0-9a-f-]{36})\/?$/i;

export const GET = rota('chamados.ler', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'chamado_nao_encontrado');
  const c = await (await casosDeUsoDeChamados()).chamado(ctx, id);
  const [os, nomes] = await Promise.all([
    (await casosDeUsoDeTriagem()).osDoChamado(ctx, id),
    (await casosDeUsoDeConsultas()).nomesDoChamado(ctx, id),
  ]);
  return r.responder(200, RespostaDeChamado, {
    chamado: {
      id: c.id,
      hotelId: c.hotelId,
      localId: c.localId,
      ativoId: c.ativoId,
      descricao: c.descricao,
      estado: c.estado as (typeof ESTADOS_DO_CHAMADO_API)[number],
      situacaoId: c.situacaoId,
      prioridadeId: c.prioridadeId,
      politicaAplicada: (c.politicaAplicada ?? {}) as Record<string, unknown>,
      abertoPor: c.abertoPor,
      motivoCancelamento: c.motivoCancelamento,
      versao: c.versao,
      criadoEm: c.criadoEm.toISOString(),
    },
    os: os.map((o) => ({
      id: o.id,
      hotelId: o.hotelId,
      chamadoId: o.chamadoId,
      estado: o.estado as (typeof ESTADOS_DA_OS_API)[number],
      situacaoId: o.situacaoId,
      responsavel: o.responsavel,
      motivoCancelamento: o.motivoCancelamento,
      motivoReabertura: o.motivoReabertura,
      criadoPor: o.criadoPor,
      versao: o.versao,
      criadoEm: o.criadoEm.toISOString(),
    })),
    nomes,
  });
});
