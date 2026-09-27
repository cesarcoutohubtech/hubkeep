// GET /api/v1/proprietarios — proprietários com os vínculos e a vigência (A4).
// POST /api/v1/proprietarios — cadastra um proprietário. Só o Admin do grupo.
import {
  PedidoDeProprietario,
  RespostaDeProprietarioAlterado,
  RespostaDeProprietarios,
} from '@hubkeep/contratos';
import { casosDeUsoDeProprietarios } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('proprietarios.listar', async (r) => {
  const ctx = await r.contexto();
  const proprietarios = await (await casosDeUsoDeProprietarios()).listarProprietarios(ctx);
  return r.responder(200, RespostaDeProprietarios, {
    proprietarios: proprietarios.map((p) => ({
      id: p.id,
      nome: p.nome,
      documento: p.documento,
      vinculos: p.vinculos.map((v) => ({
        id: v.id,
        tipo: v.tipo,
        hotelId: v.hotelId,
        hotelNome: v.hotelNome,
        localId: v.localId,
        localNome: v.localNome,
        vigenciaInicio: v.vigencia.inicio,
        vigenciaFim: v.vigencia.fim,
        vigente: v.vigente,
      })),
    })),
  });
});

export const POST = rota('proprietarios.criar', async (r) => {
  const ctx = await r.contexto();
  const { nome, documento } = await r.corpo(PedidoDeProprietario);
  const { id } = await (await casosDeUsoDeProprietarios()).criarProprietario(ctx, nome, documento);
  return r.responder(201, RespostaDeProprietarioAlterado, { id });
});
