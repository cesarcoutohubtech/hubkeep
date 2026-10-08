// GET /api/v1/hoteis/staging — hotéis que chegaram do sistema hoteleiro, com o
// cadastro correspondente (com o modelo contratual, I2), os campos que diferem
// e o uso da licença (A1).
import { RespostaDeHoteisDoStaging } from '@hubkeep/contratos';
import { casosDeUsoDeHoteis } from '../../../../../servidor/composicao';
import { rota } from '../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('hoteis.staging', async (r) => {
  const ctx = await r.contexto();
  const { hoteis, uso } = await (await casosDeUsoDeHoteis()).listarParaAtivacao(ctx);
  return r.responder(200, RespostaDeHoteisDoStaging, {
    hoteis: hoteis.map((h) => ({
      fonte: h.fonte,
      chave: h.chave,
      nome: h.nome,
      fuso: h.fuso,
      recebidoEm: h.recebidoEm.toISOString(),
      hotel: h.hotel
        ? {
            id: h.hotel.id,
            status: h.hotel.status,
            nome: h.hotel.nome,
            fuso: h.hotel.fuso,
            modeloContratual: h.hotel.modeloContratual,
          }
        : null,
      diferencas: h.diferencas,
    })),
    uso,
  });
});
