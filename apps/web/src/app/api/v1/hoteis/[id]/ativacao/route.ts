// POST /api/v1/hoteis/{id}/ativacao — ativa o hotel, consumindo uma licença de
// hotel; as UHs pendentes entram até o saldo de UHs (A1). Sem saldo: 409
// licenca_hoteis_sem_saldo, com a tentativa registrada para a EasyGov.
import { RespostaDeAtivacaoDeHotel } from '@hubkeep/contratos';
import { casosDeUsoDeHoteis } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/ativacao\/?$/i;

export const POST = rota('hoteis.ativar', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const resultado = await (await casosDeUsoDeHoteis()).ativarHotel(ctx, id);
  return r.responder(200, RespostaDeAtivacaoDeHotel, resultado);
});
