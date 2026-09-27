// GET /api/v1/hoteis/{id}/locais — UHs e áreas comuns do hotel, no escopo de
// quem pede (RLS). A tela de proprietários usa para o vínculo com UH (A4); a
// gestão de locais entra na B1.
import { RespostaDeLocaisDoHotel } from '@hubkeep/contratos';
import { casosDeUsoDeProprietarios } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/hoteis\/([0-9a-f-]{36})\/locais\/?$/i;

export const GET = rota('hoteis.locais', async (r) => {
  const ctx = await r.contexto();
  const id = CAMINHO.exec(new URL(r.req.url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'hotel_nao_encontrado');
  const locais = await (await casosDeUsoDeProprietarios()).locaisDoHotel(ctx, id);
  return r.responder(200, RespostaDeLocaisDoHotel, {
    locais: locais.map((l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, status: l.status })),
  });
});
