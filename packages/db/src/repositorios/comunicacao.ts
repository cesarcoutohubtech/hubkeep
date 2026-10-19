// Registro dos envios da comunicação (1c, ADR-046), na unit of work do
// hk_worker. Como o aviso de SLA (0044), o envio não vai para a auditoria: a
// própria tabela, só de inserção, é o registro. O índice único parcial da
// 0049 recusa o segundo envio do mesmo evento à mesma pessoa no mesmo canal,
// fora a falha; a gravação repetida não faz nada.
import type { EnvioRegistrado } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function registrarEnvio(uow: UnidadeDeTrabalho, e: EnvioRegistrado): Promise<void> {
  await transacaoDe(uow)
    .insertInto('app.envio_notificacao')
    .values({
      id: novoId(),
      tenant_id: uow.tenantId,
      hotel_id: e.hotelId,
      evento_id: e.eventoId,
      tipo_evento: e.tipoEvento,
      usuario_id: e.usuarioId,
      canal: e.canal,
      situacao: e.situacao,
    })
    .onConflict((oc) =>
      oc
        .columns(['tenant_id', 'evento_id', 'usuario_id', 'canal'])
        .where('situacao', '<>', 'falhou')
        .doNothing(),
    )
    .execute();
}

// Inscrições de push (C4). A própria tabela guarda a criação e a revogação, e
// a inscrição não vai para a auditoria. Cada pessoa grava e revoga as do
// próprio aparelho (hk_app, a RLS da 0049); o worker revoga a que o serviço de
// push recusou (hk_worker, só a coluna revogada_em).

/**
 * Grava a inscrição do aparelho. A mesma já ativa, com as mesmas chaves, não
 * grava de novo; com chaves novas (o navegador renovou), a antiga é revogada.
 */
export async function inscreverPush(
  uow: UnidadeDeTrabalho,
  d: { endpoint: string; chaves: { p256dh: string; auth: string } },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('A inscrição de push exige um usuário na sessão.');
  const tx = transacaoDe(uow);
  const ativa = await tx
    .selectFrom('app.inscricao_push')
    .select(['id', 'chave_p256dh', 'chave_auth'])
    .where('usuario_id', '=', uow.usuarioId)
    .where('endpoint', '=', d.endpoint)
    .where('revogada_em', 'is', null)
    .executeTakeFirst();
  if (ativa && ativa.chave_p256dh === d.chaves.p256dh && ativa.chave_auth === d.chaves.auth) {
    return { id: ativa.id };
  }
  if (ativa) {
    await tx
      .updateTable('app.inscricao_push')
      .set({ revogada_em: sql`now()` })
      .where('id', '=', ativa.id)
      .execute();
  }
  const id = novoId();
  await tx
    .insertInto('app.inscricao_push')
    .values({
      id,
      tenant_id: uow.tenantId,
      usuario_id: uow.usuarioId,
      endpoint: d.endpoint,
      chave_p256dh: d.chaves.p256dh,
      chave_auth: d.chaves.auth,
    })
    .execute();
  return { id };
}

/** Revoga a inscrição ativa do aparelho da pessoa; sem ela, não faz nada. */
export async function revogarPushDoAparelho(
  uow: UnidadeDeTrabalho,
  endpoint: string,
): Promise<void> {
  if (!uow.usuarioId) throw new Error('A inscrição de push exige um usuário na sessão.');
  await transacaoDe(uow)
    .updateTable('app.inscricao_push')
    .set({ revogada_em: sql`now()` })
    .where('usuario_id', '=', uow.usuarioId)
    .where('endpoint', '=', endpoint)
    .where('revogada_em', 'is', null)
    .execute();
}

/** O worker revoga a inscrição que o serviço de push recusou (404 ou 410). */
export async function revogarInscricaoRecusada(
  uow: UnidadeDeTrabalho,
  inscricaoId: string,
): Promise<void> {
  await transacaoDe(uow)
    .updateTable('app.inscricao_push')
    .set({ revogada_em: sql`now()` })
    .where('id', '=', inscricaoId)
    .where('revogada_em', 'is', null)
    .execute();
}
