// Convite para o tenant ativo (ADR-014), do lado do servidor. A rota só lê o
// pedido e chama isto: rota não importa @hubkeep/db nem @hubkeep/auth-admin (lint).
//
//   1. o banco confirma que quem convida pode convidar, ANTES de acionar o
//      provedor — senão qualquer usuário autenticado dispararia e-mails de convite;
//   2. o provedor de identidade cria (ou reaproveita) o usuário e envia o convite;
//   3. na unit of work de quem convida: membro + papel inicial (+ auditoria e
//      evento). A RLS recusa escalada de papel mesmo se algo acima falhar;
//   4. o tenant entra na lista de sugestão do usuário (app_metadata).
//
// A regra de concessão com mensagem clara é da F0-06.
import {
  type Contexto,
  concederPapel,
  criarMembro,
  ehMembro,
  nomeDoTenant,
  type Papel,
  podeConvidar,
} from '@hubkeep/db';
import { acessoBanco, provedorDeConvite } from './composicao';
import { ErroHttp } from './http';

export type { Papel };

export interface PedidoDeConvite {
  email: string;
  nome: string;
  papel: Papel;
  hotelId: string | null;
}

export async function convidar(
  ctx: Contexto,
  pedido: PedidoDeConvite,
  redirecionarPara: string,
): Promise<{ usuarioId: string }> {
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
    redirecionarPara,
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
  return { usuarioId };
}
