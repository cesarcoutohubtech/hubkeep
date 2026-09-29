// GET /api/v1/ativos/{id}/anexos — anexos do ativo, do mais novo para o
// mais antigo, como a RLS de app.anexo os mostra a quem pede (B4).
import { RespostaDeAnexos } from '@hubkeep/contratos';
import { casosDeUsoDeAnexos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/anexos\/?$/i;

export const GET = rota('anexos.listar_ativo', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'registro_nao_encontrado', { entidade: 'ativo' });
  const anexos = await (await casosDeUsoDeAnexos()).listar(ctx, 'ativo', id);
  return r.responder(200, RespostaDeAnexos, {
    anexos: anexos.map((a) => ({
      id: a.id,
      tipo: a.tipo as 'image/jpeg',
      nome: a.nome,
      temMiniatura: a.temMiniatura,
      usuarioId: a.usuarioId,
      nomeUsuario: a.nomeUsuario,
      criadoEm: a.criadoEm.toISOString(),
      podeRemover: a.podeRemover,
    })),
  });
});
