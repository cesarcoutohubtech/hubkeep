// POST /api/v1/membros/{usuarioId}/desativacao — desativar o membro no tenant (A3).
// Só o Admin do grupo; desativado, o membro perde o acesso na hora (RLS).
import { RespostaDeAtivoDoMembro } from '@hubkeep/contratos';
import { casosDeUsoDeMembros } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/membros\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('membros.desativar', async (r) => {
  const ctx = await r.contexto();
  const usuarioId = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!usuarioId) throw new ErroHttp(404, 'membro_nao_encontrado');
  await (await casosDeUsoDeMembros()).desativarMembro(ctx, usuarioId);
  return r.responder(200, RespostaDeAtivoDoMembro, { usuarioId, ativo: false });
});
