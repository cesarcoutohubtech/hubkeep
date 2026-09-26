// Credencial do agente conector, pelo Admin do grupo (hk_app, unit of work).
// A RLS de staging.credencial_agente só deixa o Admin criar e revogar; a
// aplicação já barrou antes, com código claro (podeGerenciarCredencialDeAgente).
// O hash nunca vai para auditoria nem evento.
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarCredencialDeAgente(
  uow: UnidadeDeTrabalho,
  credencial: { descricao: string; hash: string },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('staging.credencial_agente')
    .values({
      id,
      tenant_id: uow.tenantId,
      descricao: credencial.descricao,
      hash_segredo: credencial.hash,
    })
    .execute();
  uow.auditar({
    entidade: 'credencial_agente',
    registroId: id,
    acao: 'criar',
    depois: { id, descricao: credencial.descricao },
  });
  uow.publicar({
    tipo: 'credencial_agente.criada',
    entidade: 'credencial_agente',
    registroId: id,
    payload: { id, descricao: credencial.descricao },
  });
  return { id };
}

/** null se não existe no tenant (ou não é visível) ou já estava revogada. */
export async function revogarCredencialDeAgente(
  uow: UnidadeDeTrabalho,
  id: string,
): Promise<{ revogadaEm: Date } | null> {
  const r = await transacaoDe(uow)
    .updateTable('staging.credencial_agente')
    .set({ revogado_em: sql`now()` })
    .where('id', '=', id)
    .where('revogado_em', 'is', null)
    .returning('revogado_em')
    .executeTakeFirst();
  if (!r?.revogado_em) return null;
  const revogadaEm = new Date(r.revogado_em as unknown as string | Date);
  uow.auditar({
    entidade: 'credencial_agente',
    registroId: id,
    acao: 'revogar',
    depois: { id, revogadaEm: revogadaEm.toISOString() },
  });
  uow.publicar({
    tipo: 'credencial_agente.revogada',
    entidade: 'credencial_agente',
    registroId: id,
    payload: { id },
  });
  return { revogadaEm };
}
