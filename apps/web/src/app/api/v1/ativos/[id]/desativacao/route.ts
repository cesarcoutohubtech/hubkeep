// POST /api/v1/ativos/{id}/desativacao — desativa o ativo, com a versão vista (B3).
import { PedidoDeVersaoDeAtivo, RespostaDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeAtivos } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/ativos\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('ativos.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'ativo_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeVersaoDeAtivo);
  const gravado = await (await casosDeUsoDeAtivos()).desativar(ctx, id, versao);
  return r.responder(200, RespostaDeAtivoGravado, { id, ...gravado });
});
