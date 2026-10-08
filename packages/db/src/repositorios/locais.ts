// Locais do hotel (fase 1a, B1), na unit of work, com auditoria e evento. Só
// área comum se grava aqui, e a edificação de qualquer local (I2); UH vem da
// promoção do worker (promocao.ts). A RLS
// decide por último: quem não tem escrita no hotel tem o INSERT recusado
// (42501) e o UPDATE sem linha.
import type { MudancaDeLocal } from '@hubkeep/aplicacao';
import { NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { colunasPesquisaveisDoLocal } from './busca';

export async function criarAreaComum(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  dados: { nome: string; andar: string | null; edificacao?: string | null },
): Promise<{ id: string }> {
  const id = novoId();
  const edificacao = dados.edificacao ?? null;
  const pesquisaveis = colunasPesquisaveisDoLocal({ nome: dados.nome, edificacao });
  await transacaoDe(uow)
    .insertInto('app.local')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: hotelId,
      tipo: 'area_comum',
      status: 'ativo',
      ...pesquisaveis,
      andar: dados.andar,
    })
    .execute();
  uow.auditar({
    entidade: 'local',
    registroId: id,
    acao: 'criar',
    hotelId,
    depois: { tipo: 'area_comum', ...dados, edificacao },
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
  mudanca: MudancaDeLocal,
): Promise<void> {
  const tx = transacaoDe(uow);
  // Com a linha travada: a promoção do worker regrava a busca da UH a partir
  // da edificação gravada, e as duas não podem se cruzar.
  const antes = await tx
    .selectFrom('app.local')
    .select(['nome', 'andar', 'edificacao', 'status'])
    .where('id', '=', localId)
    .forUpdate()
    .executeTakeFirst();
  if (!antes) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
  // Nome e edificação andam juntos com a busca; a edificação ausente fica a gravada.
  const pesquisaveis = (nome: string, edificacao: string | null | undefined) =>
    colunasPesquisaveisDoLocal({
      nome,
      edificacao: edificacao === undefined ? antes.edificacao : edificacao,
    });
  const r = await tx
    .updateTable('app.local')
    .set({
      ...('status' in mudanca
        ? { status: mudanca.status }
        : 'nome' in mudanca
          ? { ...pesquisaveis(mudanca.nome, mudanca.edificacao), andar: mudanca.andar }
          : pesquisaveis(antes.nome, mudanca.edificacao)),
      atualizado_em: sql`now()`,
    })
    .where('id', '=', localId)
    .returning(['hotel_id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('local_nao_encontrado', 'Local não encontrado.');
  const acao =
    'status' in mudanca ? (mudanca.status === 'ativo' ? 'reativar' : 'desativar') : 'alterar';
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
