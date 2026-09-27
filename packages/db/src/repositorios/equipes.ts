// Equipes do hotel (fase 1a, A6), na unit of work, com auditoria. Quem pode
// gravar é a RLS que decide por último (policy de app.equipe e
// app.equipe_membro); para os outros, o INSERT é recusado (42501) e o UPDATE
// não acha linha.
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

function nomeRepetido(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'equipe_hotel_id_nome_key') {
    throw new Conflito('equipe_nome_repetido', 'Já existe equipe com este nome no hotel.');
  }
  throw e;
}

export async function criarEquipe(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  nome: string,
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.equipe')
    .values({ id, tenant_id: uow.tenantId, hotel_id: hotelId, nome })
    .execute()
    .catch(nomeRepetido);
  uow.auditar({ entidade: 'equipe', registroId: id, acao: 'criar', hotelId, depois: { nome } });
  return { id };
}

export async function alterarEquipe(
  uow: UnidadeDeTrabalho,
  equipeId: string,
  mudanca: { nome: string } | { ativa: boolean },
): Promise<void> {
  const r = await transacaoDe(uow)
    .updateTable('app.equipe')
    .set({ ...mudanca, atualizado_em: sql`now()` })
    .where('id', '=', equipeId)
    .returning(['hotel_id'])
    .executeTakeFirst()
    .catch(nomeRepetido);
  if (!r) throw new NaoEncontrado('equipe_nao_encontrada', 'Equipe não encontrada.');
  const acao = 'nome' in mudanca ? 'renomear' : mudanca.ativa ? 'reativar' : 'desativar';
  uow.auditar({
    entidade: 'equipe',
    registroId: equipeId,
    acao,
    hotelId: r.hotel_id,
    depois: mudanca,
  });
}

export async function definirMembroDaEquipe(
  uow: UnidadeDeTrabalho,
  equipeId: string,
  usuarioId: string,
  ativo: boolean,
): Promise<void> {
  const tx = transacaoDe(uow);
  const equipe = await tx
    .selectFrom('app.equipe')
    .select('hotel_id')
    .where('id', '=', equipeId)
    .executeTakeFirst();
  if (!equipe) throw new NaoEncontrado('equipe_nao_encontrada', 'Equipe não encontrada.');
  if (ativo) {
    await tx
      .insertInto('app.equipe_membro')
      .values({
        tenant_id: uow.tenantId,
        hotel_id: equipe.hotel_id,
        equipe_id: equipeId,
        usuario_id: usuarioId,
      })
      .onConflict((oc) =>
        oc
          .columns(['equipe_id', 'usuario_id'])
          .doUpdateSet({ ativo: true, atualizado_em: sql`now()` }),
      )
      .execute();
  } else {
    const r = await tx
      .updateTable('app.equipe_membro')
      .set({ ativo: false, atualizado_em: sql`now()` })
      .where('equipe_id', '=', equipeId)
      .where('usuario_id', '=', usuarioId)
      .returning(['equipe_id'])
      .executeTakeFirst();
    if (!r) throw new NaoEncontrado('membro_nao_encontrado', 'Membro não está na equipe.');
  }
  uow.auditar({
    entidade: 'equipe',
    registroId: equipeId,
    acao: ativo ? 'por_membro' : 'tirar_membro',
    hotelId: equipe.hotel_id,
    depois: { usuarioId, ativo },
  });
}
