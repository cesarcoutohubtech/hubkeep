// POST /api/v1/ingestao/lotes — o agente conector envia um lote (F0-08, ADR-008).
//
//   Authorization: Agent hk_<tenant_id>_<segredo>
//
// O prefixo diz o tenant; o segredo é conferido pelo hash contra as credenciais
// NÃO revogadas desse tenant, na mesma transação hk_ingestao que grava o
// staging. Lote repetido (mesmo conteúdo) volta 200 com novo: false e não
// reprocessa nada; lote novo volta 201. Acima de LIMITE_BYTES_LOTE, 413: o
// agente divide antes (o corpo da função da Vercel aceita até 4,5 MB).
import { CredencialInvalida } from '@hubkeep/aplicacao';
import { LIMITE_BYTES_LOTE, LoteDeIngestao, RespostaDeLote } from '@hubkeep/contratos';
import { recebimentoDeLotes } from '../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = rota('ingestao.lotes', async (r) => {
  const [esquema, credencial] = (r.req.headers.get('authorization') ?? '').split(' ');
  if (esquema !== 'Agent' || !credencial) {
    throw new ErroHttp(401, 'nao_autenticado', { motivo: 'credencial_ausente' });
  }
  const lote = await r.corpo(LoteDeIngestao, { limiteBytes: LIMITE_BYTES_LOTE });
  let recebido;
  try {
    recebido = await (await recebimentoDeLotes()).receberLote(credencial, lote);
  } catch (e) {
    if (e instanceof CredencialInvalida) {
      throw new ErroHttp(401, 'nao_autenticado', { motivo: 'credencial_invalida' });
    }
    throw e;
  }
  r.marcarTenant(recebido.tenantId);
  return r.responder(recebido.novo ? 201 : 200, RespostaDeLote, {
    cargaId: recebido.cargaId,
    loteHash: recebido.loteHash,
    novo: recebido.novo,
    registros: lote.registros.length,
  });
});
