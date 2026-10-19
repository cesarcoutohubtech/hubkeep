// POST /api/v1/modelos-de-ativo/{id}/desativacao — desativa o modelo; os ativos que nasceram dele ficam com o que foi copiado (ADR-026). Com a versão vista (M1; ADR-029).
import { PedidoDeVersaoDeModeloDeAtivo, RespostaDeModeloDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeModelosDeAtivo } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-ativo\/([0-9a-f-]{36})\/desativacao\/?$/i;

export const POST = rota('modelos_de_ativo.desativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'modelo_ativo_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeVersaoDeModeloDeAtivo);
  const gravado = await (await casosDeUsoDeModelosDeAtivo()).desativar(ctx, id, versao);
  return r.responder(200, RespostaDeModeloDeAtivoGravado, { id, ...gravado });
});
