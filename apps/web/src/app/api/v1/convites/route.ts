// POST /api/v1/convites — convida alguém para o tenant ativo (ADR-014).
//
//   1. contexto verificado de quem convida;
//   2. o banco confirma que ele pode convidar, ANTES de acionar o provedor —
//      senão qualquer usuário autenticado dispararia e-mails de convite;
//   3. o provedor de identidade cria (ou reaproveita) o usuário e envia o convite;
//   4. na unit of work de quem convida: membro + papel inicial (+ auditoria e
//      evento). A RLS recusa escalada de papel mesmo se algo acima falhar;
//   5. o tenant entra na lista de sugestão do usuário (app_metadata).
//
// A validação de entrada com Zod e o formato único de erro são da F0-07; a
// regra de concessão com mensagem clara, da F0-06.
import {
  concederPapel,
  criarMembro,
  ehMembro,
  nomeDoTenant,
  type Papel,
  podeConvidar,
} from '@hubkeep/db';
import { acessoBanco, provedorDeConvite } from '../../../../servidor/composicao';
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

interface Pedido {
  email: string;
  nome: string;
  papel: Papel;
  hotelId: string | null;
}

function lerPedido(corpo: unknown): Pedido {
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
  const banco = await acessoBanco();

  const { tenant, pode, jaMembro } = await banco.withContext(ctx, async (tx) => ({
    tenant: await nomeDoTenant(tx),
    pode: await podeConvidar(tx),
    jaMembro: await ehMembro(tx, { email: pedido.email }),
  }));
  if (!tenant) throw new ErroHttp(403, 'sem_acesso_ao_tenant', 'Você não é membro deste tenant.');
  if (!pode) throw new ErroHttp(403, 'sem_permissao', 'Você não pode convidar membros.');
  // Antes do provedor: reconvite de membro não reenvia e-mail.
  if (jaMembro) throw new ErroHttp(409, 'ja_e_membro', 'Esta pessoa já é membro deste grupo.');

  const provedor = provedorDeConvite();
  const { usuarioId } = await provedor.convidar({
    email: pedido.email,
    redirecionarPara: urlDeAceite(req),
    nomeConvidado: pedido.nome,
    nomeTenant: tenant,
  });

  // Pelo id, para quem já é membro com outro e-mail. Se o usuário existia no
  // Auth mas o membro não chegou a ser gravado (falha parcial prevista no
  // ADR-014), segue normalmente e completa o cadastro.
  if (await banco.withContext(ctx, (tx) => ehMembro(tx, { usuarioId }))) {
    throw new ErroHttp(409, 'ja_e_membro', 'Esta pessoa já é membro deste grupo.');
  }

  await banco.executar(ctx, async (uow) => {
    await criarMembro(uow, { usuarioId, nome: pedido.nome, email: pedido.email });
    await concederPapel(uow, {
      usuarioId,
      papel: pedido.papel,
      escopo: pedido.hotelId ? { tipo: 'hotel', hotelId: pedido.hotelId } : { tipo: 'grupo' },
    });
  });

  await provedor.vincularTenant(usuarioId, ctx.tenantId);
  return json(201, { usuarioId });
});
