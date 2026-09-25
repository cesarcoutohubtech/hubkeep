// POST /api/v1/convites — convida alguém para o tenant ativo.
//
// O fluxo inteiro mora no caso de uso (packages/aplicacao, ADR-018): regra do
// domínio → escopo visível → usuário no Auth SEM e-mail → membro, atribuição e
// evento numa unit of work (com compensação se falhar) → o worker envia o
// e-mail a partir do evento. Não existe convite sem acesso gravado.
//
// A validação de entrada com Zod e o formato único de erro são da F0-07.
import { PAPEIS, type Escopo, type Papel } from '@hubkeep/dominio';
import { casoDeUsoDeConvites } from '../../../../servidor/composicao';
import { resolverContexto } from '../../../../servidor/contexto';
import { ErroHttp, handler, json } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerPedido(corpo: unknown) {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const invalido = (m: string) => new ErroHttp(422, 'entrada_invalida', m);
  if (typeof c['email'] !== 'string' || !EMAIL.test(c['email'])) throw invalido('email inválido.');
  if (typeof c['nome'] !== 'string' || !c['nome'].trim()) throw invalido('nome obrigatório.');
  if (!PAPEIS.includes(c['papel'] as Papel)) throw invalido('papel inválido.');
  const hotelId = c['hotelId'] ?? null;
  if (hotelId !== null && (typeof hotelId !== 'string' || !UUID.test(hotelId))) {
    throw invalido('hotelId inválido.');
  }
  let validoAte: Date | null = null;
  if (c['validoAte'] !== undefined && c['validoAte'] !== null) {
    validoAte = typeof c['validoAte'] === 'string' ? new Date(c['validoAte']) : new Date(NaN);
    if (Number.isNaN(validoAte.getTime())) throw invalido('validoAte inválido (use data ISO).');
  }
  const escopo: Escopo =
    typeof hotelId === 'string' ? { tipo: 'hotel', hotelId } : { tipo: 'grupo' };
  return {
    email: c['email'].trim().toLowerCase(),
    nome: c['nome'].trim(),
    papel: c['papel'] as Papel,
    escopo,
    validoAte,
  };
}

function urlDeAceite(req: Request): string {
  // O Supabase só redireciona para URLs da allow-list do projeto
  // (additional_redirect_urls), então um Host forjado não desvia o link.
  const base = process.env['HK_URL_SITE'] ?? new URL(req.url).origin;
  return `${base.replace(/\/+$/, '')}/auth/confirmar`;
}

export const POST = handler(async (req) => {
  const ctx = await resolverContexto(req);
  const pedido = lerPedido(await req.json().catch(() => null));
  const { usuarioId } = await (
    await casoDeUsoDeConvites()
  ).convidarMembro(ctx, { ...pedido, redirecionarPara: urlDeAceite(req) });
  return json(201, { usuarioId });
});
