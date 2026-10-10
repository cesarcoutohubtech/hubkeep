// Códigos de falha, causa e solução (fase 1b, I6), na unit of work, com
// auditoria e evento. A RLS decide por último (0036): só o Admin do grupo
// grava; o tipo, a categoria e a chave padrão não têm GRANT de UPDATE.
import type { TipoDeCodigoDeManutencao } from '@hubkeep/dominio';
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarCodigo(
  uow: UnidadeDeTrabalho,
  c: {
    tipo: TipoDeCodigoDeManutencao;
    categoriaId: string | null;
    chavePadrao: string | null;
    nomes: object;
  },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.codigo_manutencao')
    .values({
      id,
      tenant_id: uow.tenantId,
      tipo: c.tipo,
      categoria_id: c.categoriaId,
      chave_padrao: c.chavePadrao,
      nomes: JSON.stringify(c.nomes),
    })
    .execute();
  uow.auditar({ entidade: 'codigo_manutencao', registroId: id, acao: 'criar', depois: c });
  uow.publicar({
    tipo: 'codigo_manutencao.criado',
    entidade: 'codigo_manutencao',
    registroId: id,
    payload: { tipo: c.tipo, chavePadrao: c.chavePadrao },
  });
  return { id };
}

export async function alterarCodigo(
  uow: UnidadeDeTrabalho,
  id: string,
  mudanca: { nomes: object } | { ativa: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.codigo_manutencao')
    .select(['nomes', 'ativa'])
    .where('id', '=', id)
    .executeTakeFirst();
  const valores =
    'ativa' in mudanca ? { ativa: mudanca.ativa } : { nomes: JSON.stringify(mudanca.nomes) };
  const r = await tx
    .updateTable('app.codigo_manutencao')
    .set({ ...valores, atualizado_em: sql`now()` })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r || !antes) throw new NaoEncontrado('codigo_nao_encontrado', 'Código não encontrado.');
  const acao = 'ativa' in mudanca ? (mudanca.ativa ? 'reativar' : 'desativar') : 'alterar';
  uow.auditar({ entidade: 'codigo_manutencao', registroId: id, acao, antes, depois: mudanca });
  uow.publicar({
    tipo: 'codigo_manutencao.alterado',
    entidade: 'codigo_manutencao',
    registroId: id,
    payload: { acao },
  });
}
