// Membro e atribuição de papel — o que o convite grava (ADR-014): o membro
// nasce na unit of work de quem convida, com o id que o provedor de identidade
// devolveu. Quem pode convidar e que papel pode conceder é garantido pela RLS
// (sem escalada); as mensagens de erro claras da regra de concessão vêm com o
// caso de uso da F0-06.
import type { AppPapel as Papel } from '../tipos-banco';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export type EscopoConcessao =
  { tipo: 'grupo' } | { tipo: 'bandeira'; bandeiraId: string } | { tipo: 'hotel'; hotelId: string };

export async function criarMembro(
  uow: UnidadeDeTrabalho,
  membro: { usuarioId: string; nome: string; email: string },
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
    payload: { usuarioId: membro.usuarioId, email: membro.email },
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
