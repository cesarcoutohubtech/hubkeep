// Categorias de ativo (fase 1a, B2; ADR-028), na unit of work, com auditoria e
// evento. A RLS decide por último: só o Admin do grupo grava.
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarCategoria(
  uow: UnidadeDeTrabalho,
  c: { chavePadrao: string | null; nomes: object; campos: object[] },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.categoria_ativo')
    .values({
      id,
      tenant_id: uow.tenantId,
      chave_padrao: c.chavePadrao,
      nomes: JSON.stringify(c.nomes),
      campos: JSON.stringify(c.campos),
    })
    .execute();
  uow.auditar({ entidade: 'categoria_ativo', registroId: id, acao: 'criar', depois: c });
  uow.publicar({
    tipo: 'categoria_ativo.criada',
    entidade: 'categoria_ativo',
    registroId: id,
    payload: { chavePadrao: c.chavePadrao },
  });
  return { id };
}

export async function alterarCategoria(
  uow: UnidadeDeTrabalho,
  id: string,
  mudanca: { nomes: object; campos: object[] } | { ativa: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.categoria_ativo')
    .select(['nomes', 'campos', 'ativa'])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'ativa' in mudanca
      ? { ativa: mudanca.ativa }
      : { nomes: JSON.stringify(mudanca.nomes), campos: JSON.stringify(mudanca.campos) };
  const r = await tx
    .updateTable('app.categoria_ativo')
    .set({ ...valores, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r || !antes)
    throw new NaoEncontrado('categoria_nao_encontrada', 'Categoria não encontrada.');
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({ entidade: 'categoria_ativo', registroId: id, acao, antes, depois: mudanca });
  uow.publicar({
    tipo: 'categoria_ativo.alterada',
    entidade: 'categoria_ativo',
    registroId: id,
    payload: { acao },
  });
}
