// POST /api/v1/convites — convida alguém para o tenant ativo.
//
// O fluxo inteiro mora no caso de uso (packages/aplicacao, ADR-018): regra do
// domínio → escopo visível → usuário no Auth SEM e-mail → membro, atribuição e
// evento numa unit of work (com compensação se falhar) → o worker envia o
// e-mail a partir do evento. Não existe convite sem acesso gravado.
// Entrada e saída pelos contratos (PedidoDeConvite, RespostaDeConvite).
import { PedidoDeConvite, RespostaDeConvite } from '@hubkeep/contratos';
import { casoDeUsoDeConvites } from '../../../../servidor/composicao';
import { rota } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function urlDeAceite(req: Request): string {
  // O Supabase só redireciona para URLs da allow-list do projeto
  // (additional_redirect_urls), então um Host forjado não desvia o link.
  const base = process.env['HK_URL_SITE'] ?? new URL(req.url).origin;
  return `${base.replace(/\/+$/, '')}/auth/confirmar`;
}

export const POST = rota('convites.criar', async (r) => {
  const ctx = await r.contexto();
  const pedido = await r.corpo(PedidoDeConvite);
  const { usuarioId } = await (
    await casoDeUsoDeConvites()
  ).convidarMembro(ctx, {
    email: pedido.email,
    nome: pedido.nome,
    papel: pedido.papel,
    escopo: pedido.hotelId ? { tipo: 'hotel', hotelId: pedido.hotelId } : { tipo: 'grupo' },
    validoAte: pedido.validoAte ? new Date(pedido.validoAte) : null,
    redirecionarPara: urlDeAceite(r.req),
  });
  return r.responder(201, RespostaDeConvite, { usuarioId });
});
