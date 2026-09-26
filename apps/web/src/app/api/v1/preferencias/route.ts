// GET e PUT /api/v1/preferencias — idioma e região de quem usa (F0-10b,
// ADR-022). Cada um lê e grava só as próprias (RLS); a resposta traz o que
// foi resolvido (membro → tenant → navegador → pt-BR) e o que foi gravado.
import { PedidoDePreferencias, RespostaDePreferencias } from '@hubkeep/contratos';
import { casosDeUsoDePreferencias } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = rota('preferencias.ler', async (r) => {
  const ctx = await r.contexto();
  const p = await (
    await casosDeUsoDePreferencias()
  ).lerPreferencias(ctx, r.req.headers.get('accept-language'));
  return r.responder(200, RespostaDePreferencias, p);
});

export const PUT = rota('preferencias.gravar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDePreferencias);
  const casos = await casosDeUsoDePreferencias();
  await casos.gravarPreferencias(ctx, pedido);
  const p = await casos.lerPreferencias(ctx, r.req.headers.get('accept-language'));
  return r.responder(200, RespostaDePreferencias, p);
});
