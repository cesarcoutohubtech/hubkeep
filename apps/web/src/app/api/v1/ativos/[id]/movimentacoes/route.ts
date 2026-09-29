// GET /api/v1/ativos/{id}/movimentacoes — movimentações do ativo entre locais
// do hotel, da mais nova para a mais velha (B3c). O proprietário não lê (RLS).
import { RespostaDeMovimentacoesDoAtivo } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/movimentacoes\/?$/i;

export const GET = rota('ativos.movimentacoes', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const movimentacoes = await (await casosDeUsoDeAtivos()).listarMovimentacoes(ctx, id);
  return r.responder(200, RespostaDeMovimentacoesDoAtivo, {
    movimentacoes: movimentacoes.map((m) => ({
      id: m.id,
      localOrigemId: m.localOrigemId,
      localDestinoId: m.localDestinoId,
      usuarioId: m.usuarioId,
      nomeUsuario: m.nomeUsuario,
      movidoEm: m.movidoEm.toISOString(),
    })),
  });
});
