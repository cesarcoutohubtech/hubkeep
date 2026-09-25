// Membro e atribuição de papel. O membro nasce na unit of work de quem convida,
// com o id que o provedor de identidade devolveu (ADR-014). Quem pode conceder
// ou revogar o quê é decidido duas vezes: pelo caso de uso (mensagem clara,
// packages/aplicacao) e pela RLS (a garantia).
import { type Escopo, NaoEncontrado, type Papel } from '@hubkeep/dominio';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/** Escopo de uma concessão — o mesmo tipo do domínio. */
export type EscopoConcessao = Escopo;

/**
 * Grava o membro e publica membro.convidado. O payload leva o que o worker
 * precisa para enviar o e-mail depois do commit (ADR-018): o convite nunca sai
 * antes de o acesso estar gravado.
 */
export async function criarMembro(
  uow: UnidadeDeTrabalho,
  membro: { usuarioId: string; nome: string; email: string },
  convite?: { nomeTenant: string; redirecionarPara: string },
): Promise<void> {
  await transacaoDe(uow)
    .insertInto('app.membro')
    .values({
      tenant_id: uow.tenantId,
      usuario_id: membro.usuarioId,
      nome: membro.nome,
      email: membro.email,
    })
    .execute();
  uow.auditar({
    entidade: 'membro',
    registroId: membro.usuarioId,
    acao: 'convidar',
    depois: membro,
  });
  uow.publicar({
    tipo: 'membro.convidado',
    entidade: 'membro',
    registroId: membro.usuarioId,
    payload: { usuarioId: membro.usuarioId, email: membro.email, nome: membro.nome, ...convite },
  });
}

export async function concederPapel(
  uow: UnidadeDeTrabalho,
  concessao: { usuarioId: string; papel: Papel; escopo: EscopoConcessao; validoAte?: Date | null },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Concessão de papel exige um usuário na sessão.');
  const id = novoId();
  const { escopo } = concessao;
  const hotelId = escopo.tipo === 'hotel' ? escopo.hotelId : null;
  await transacaoDe(uow)
    .insertInto('app.atribuicao_escopo')
    .values({
      id,
      tenant_id: uow.tenantId,
      usuario_id: concessao.usuarioId,
      papel: concessao.papel,
      escopo_tipo: escopo.tipo,
      bandeira_id: escopo.tipo === 'bandeira' ? escopo.bandeiraId : null,
      hotel_id: hotelId,
      proprietario_id: escopo.tipo === 'proprietario' ? escopo.proprietarioId : null,
      valido_ate: concessao.validoAte ?? null,
      concedido_por: uow.usuarioId,
    })
    .execute();
  uow.auditar({
    entidade: 'atribuicao_escopo',
    registroId: id,
    acao: 'conceder',
    hotelId,
    depois: { ...concessao, id },
  });
  uow.publicar({
    tipo: 'papel.concedido',
    entidade: 'atribuicao_escopo',
    registroId: id,
    payload: { usuarioId: concessao.usuarioId, papel: concessao.papel, escopo: concessao.escopo },
  });
  return { id };
}

/**
 * Revoga uma atribuição (exclusão lógica: revogado_em/revogado_por, ADR-011).
 * Se a RLS esconde a linha de quem revoga, o UPDATE não afeta nada e não dá
 * erro — por isso o retorno é conferido: nada revogado é NaoEncontrado.
 */
export async function revogarPapel(uow: UnidadeDeTrabalho, atribuicaoId: string): Promise<void> {
  if (!uow.usuarioId) throw new Error('Revogação de papel exige um usuário na sessão.');
  const r = await transacaoDe(uow)
    .updateTable('app.atribuicao_escopo')
    .set({ revogado_em: new Date(), revogado_por: uow.usuarioId })
    .where('id', '=', atribuicaoId)
    .where('revogado_em', 'is', null)
    .returning(['usuario_id', 'papel', 'escopo_tipo', 'hotel_id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('Atribuição não encontrada ou já revogada.');
  uow.auditar({
    entidade: 'atribuicao_escopo',
    registroId: atribuicaoId,
    acao: 'revogar',
    hotelId: r.hotel_id,
    antes: { usuarioId: r.usuario_id, papel: r.papel, escopo: r.escopo_tipo, revogadoEm: null },
    depois: { revogadoPor: uow.usuarioId },
  });
  uow.publicar({
    tipo: 'papel.revogado',
    entidade: 'atribuicao_escopo',
    registroId: atribuicaoId,
    payload: { usuarioId: r.usuario_id, papel: r.papel },
  });
}
