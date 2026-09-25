// POST /api/v1/convites — convida alguém para o tenant ativo (ADR-014). Aqui só
// o contexto verificado e a leitura do pedido; o fluxo (permissão, provedor,
// unit of work) está em servidor/convites.ts.
//
// A validação de entrada com Zod e o formato único de erro são da F0-07.
import { convidar, type Papel, type PedidoDeConvite } from '../../../../servidor/convites';
import { resolverContexto } from '../../../../servidor/contexto';
import { ErroHttp, handler, json } from '../../../../servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAPEIS: readonly Papel[] = [
  'admin_grupo',
  'gestor_csc',
  'implantador',
  'gerente_hotel',
  'tecnico',
  'solicitante',
  'proprietario',
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerPedido(corpo: unknown): PedidoDeConvite {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const invalido = (m: string) => new ErroHttp(422, 'entrada_invalida', m);
  if (typeof c['email'] !== 'string' || !EMAIL.test(c['email'])) throw invalido('email inválido.');
  if (typeof c['nome'] !== 'string' || !c['nome'].trim()) throw invalido('nome obrigatório.');
  if (!PAPEIS.includes(c['papel'] as Papel)) throw invalido('papel inválido.');
  const hotelId = c['hotelId'] ?? null;
  if (hotelId !== null && (typeof hotelId !== 'string' || !UUID.test(hotelId))) {
    throw invalido('hotelId inválido.');
  }
  return {
    email: c['email'].trim().toLowerCase(),
    nome: c['nome'].trim(),
    papel: c['papel'] as Papel,
    hotelId: hotelId as string | null,
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
  const { usuarioId } = await convidar(ctx, pedido, urlDeAceite(req));
  return json(201, { usuarioId });
});
