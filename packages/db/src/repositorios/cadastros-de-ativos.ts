// Decisão sobre o cadastro do ativo (fase 1b, M4; migração 0058), na unit of
// work, com auditoria e evento. Sobe a versão do ativo pela versão vista
// (ADR-029) e, na recusa, desativa o ativo na mesma transação; depois grava a
// decisão, só de inserção. A RLS decide por último: só a gestão do hotel
// insere a decisão, em nome do usuário do contexto. Duas decisões no mesmo
// ativo esbarram na versão ou na unicidade da decisão.
import {
  Conflito,
  type DecisaoDoCadastro,
  NaoEncontrado,
  conflitoDeVersao,
} from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { agoraNaGravacao } from './instante-do-roteiro';

export async function decidirCadastroDeAtivo(
  uow: UnidadeDeTrabalho,
  d: {
    ativoId: string;
    hotelId: string;
    versaoEsperada: number;
    decisao: DecisaoDoCadastro;
    motivo: string | null;
  },
): Promise<{ versao: number }> {
  if (!uow.usuarioId) throw new Error('Decidir o cadastro exige um usuário no contexto.');
  const tx = transacaoDe(uow);
  const agora = agoraNaGravacao(uow);
  const r = await tx
    .updateTable('app.ativo')
    .set({
      versao: sql<number>`versao + 1`,
      atualizado_em: agora,
      ...(d.decisao === 'recusado' ? { desativado_em: agora } : {}),
    })
    .where('id', '=', d.ativoId)
    .where('hotel_id', '=', d.hotelId)
    .where('versao', '=', d.versaoEsperada)
    .returning('versao')
    .executeTakeFirst();
  if (!r) {
    const atual = await tx
      .selectFrom('app.ativo')
      .select('versao')
      .where('id', '=', d.ativoId)
      .executeTakeFirst();
    if (atual && atual.versao !== d.versaoEsperada) throw conflitoDeVersao(atual.versao);
    throw new NaoEncontrado('ativo_nao_encontrado', 'Ativo não encontrado.');
  }
  try {
    await tx
      .insertInto('app.ativo_decisao_cadastro')
      .values({
        id: novoId(),
        tenant_id: uow.tenantId,
        hotel_id: d.hotelId,
        ativo_id: d.ativoId,
        decisao: d.decisao,
        motivo: d.motivo,
        decidido_por: uow.usuarioId,
        decidido_em: agora,
      })
      .execute();
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      throw new Conflito('cadastro_ja_decidido', 'O cadastro deste ativo já foi decidido.');
    }
    throw e;
  }
  const acao = d.decisao === 'aprovado' ? 'aprovar_cadastro' : 'recusar_cadastro';
  uow.auditar({
    entidade: 'ativo',
    registroId: d.ativoId,
    acao,
    hotelId: d.hotelId,
    depois: { situacaoCadastro: d.decisao, motivo: d.motivo, versao: r.versao },
  });
  uow.publicar({
    tipo: 'ativo.cadastro_decidido',
    entidade: 'ativo',
    registroId: d.ativoId,
    payload: { hotelId: d.hotelId, decisao: d.decisao, versao: r.versao },
  });
  return { versao: r.versao };
}
