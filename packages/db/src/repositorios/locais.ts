// Locais do hotel (fase 1a, B1), na unit of work, com auditoria e evento. Só
// área comum se grava aqui; UH vem da promoção do worker (promocao.ts). A RLS
// decide por último: quem não tem escrita no hotel tem o INSERT recusado
// (42501) e o UPDATE sem linha.
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { colunasPesquisaveisDoLocal } from './busca';

export async function criarAreaComum(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  dados: { nome: string; andar: string | null },
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.local')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: hotelId,
      tipo: 'area_comum',
      status: 'ativo',
      ...colunasPesquisaveisDoLocal(dados.nome),
      andar: dados.andar,
    })
    .execute();
  uow.auditar({
    entidade: 'local',
    registroId: id,
    acao: 'criar',
    hotelId,
    depois: { tipo: 'area_comum', ...dados },
  });
  uow.publicar({
    tipo: 'local.criado',
    entidade: 'local',
    registroId: id,
    payload: { hotelId, tipo: 'area_comum' },
  });
  return { id };
}

export async function alterarLocal(
  uow: UnidadeDeTrabalho,
  localId: string,
  mudanca: { nome: string; andar: string | null } | { status: 'ativo' | 'inativo' },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.local')
    .select(['nome', 'andar', 'status'])
    .where('id', '=', localId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.local')
    .set({
      ...('nome' in mudanca
        ? { ...colunasPesquisaveisDoLocal(mudanca.nome), andar: mudanca.andar }
        : { status: mudanca.status }),
      atualizado_em: sql`now()`,
    })
    .where('id', '=', localId)
    .returning(['hotel_id'])
    .executeTakeFirst();
  if (!r || !antes) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
  const acao =
    'nome' in mudanca ? 'alterar' : mudanca.status === 'ativo' ? 'reativar' : 'desativar';
  uow.auditar({
    entidade: 'local',
    registroId: localId,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: mudanca,
  });
  uow.publicar({
    tipo: 'local.alterado',
    entidade: 'local',
    registroId: localId,
    payload: { hotelId: r.hotel_id },
  });
}
