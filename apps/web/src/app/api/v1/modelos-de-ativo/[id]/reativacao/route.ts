// POST /api/v1/modelos-de-ativo/{id}/reativacao — reativa o modelo. Com a versão vista (M1; ADR-029).
import { PedidoDeVersaoDeModeloDeAtivo, RespostaDeModeloDeAtivoGravado } from '@hubkeep/contratos';
import { casosDeUsoDeModelosDeAtivo } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/modelos-de-ativo\/([0-9a-f-]{36})\/reativacao\/?$/i;

export const POST = rota('modelos_de_ativo.reativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'modelo_ativo_nao_encontrado');
  const { versao } = await r.corpo(PedidoDeVersaoDeModeloDeAtivo);
  const gravado = await (await casosDeUsoDeModelosDeAtivo()).reativar(ctx, id, versao);
  return r.responder(200, RespostaDeModeloDeAtivoGravado, { id, ...gravado });
});
