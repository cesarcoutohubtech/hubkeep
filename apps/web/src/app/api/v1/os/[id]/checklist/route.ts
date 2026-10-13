// GET /api/v1/os/{id}/checklist — o checklist da OS, com as respostas (PV1,
// ADR-040); null sem checklist. Quem não vê a OS recebe 404.
// PUT /api/v1/os/{id}/checklist — quem tria aplica o modelo ativo na OS, ou
// troca o que ainda não tem resposta. Não mexe na versão da OS.
import {
  PedidoDeChecklistNaOs,
  RespostaDeChecklistAplicado,
  RespostaDeChecklistDaOs,
} from '@hubkeep/contratos';
import { casosDeUsoDeChecklists } from '../../../../../../servidor/composicao';
import { ErroHttp, rota } from '../../../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMINHO = /\/api\/v1\/os\/([0-9a-f-]{36})\/checklist\/?$/i;

const osDaRota = (url: string) => {
  const id = CAMINHO.exec(new URL(url).pathname)?.[1];
  if (!id) throw new ErroHttp(404, 'os_nao_encontrada');
  return id;
};

export const GET = rota('os.checklist', async (r) => {
  const ctx = await r.contexto();
  const c = await (await casosDeUsoDeChecklists()).daOs(ctx, osDaRota(r.req.url));
  return r.responder(200, RespostaDeChecklistDaOs, {
    checklist: c && {
      id: c.id,
      modeloId: c.modeloId,
      modeloVersao: c.modeloVersao,
      nomes: c.nomes,
      itens: c.itens,
      respostas: c.respostas,
    },
  });
});

export const PUT = rota('os.aplicar_checklist', async (r) => {
  const ctx = await r.contexto();
  const osId = osDaRota(r.req.url);
  const { modeloId } = await r.corpo(PedidoDeChecklistNaOs);
  const { id } = await (await casosDeUsoDeChecklists()).aplicarNaOs(ctx, osId, modeloId);
  return r.responder(200, RespostaDeChecklistAplicado, { id });
});
