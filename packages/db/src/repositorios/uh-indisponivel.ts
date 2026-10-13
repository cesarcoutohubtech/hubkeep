// UH indisponível (fase 1b, I4), na unit of work, com auditoria e evento. A
// RLS decide por último (migração 0034): marca quem tem escrita no hotel, em
// nome dele mesmo; liberam a gestão do hotel e o Técnico responsável por OS
// não cancelada do chamado. O índice uh_indisponivel_uma_aberta_por_chamado
// garante um período aberto por chamado.
import type { LiberacaoDeUh, MarcacaoDeUh } from '@hubkeep/aplicacao';
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';
import { agoraNaGravacao, datasDaCriacao } from './instante-do-roteiro';

/** O índice recusou: o chamado já tem a UH indisponível em aberto. */
function periodoJaAberto(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'uh_indisponivel_uma_aberta_por_chamado') {
    throw new Conflito('uh_indisponivel_ja_aberta', 'A UH já está indisponível por este chamado.');
  }
  throw e;
}

/**
 * O período aberto da UH do chamado, na abertura (com o chamado) ou depois,
 * pela gestão do hotel. Outro aberto no chamado: uh_indisponivel_ja_aberta.
 */
export async function marcarUhIndisponivel(
  uow: UnidadeDeTrabalho,
  m: MarcacaoDeUh,
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('UH indisponível exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.uh_indisponivel')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: m.hotelId,
      local_id: m.localId,
      chamado_id: m.chamadoId,
      inicio: m.inicio,
      aberta_por: uow.usuarioId,
      ...datasDaCriacao(uow),
    })
    .execute()
    .catch(periodoJaAberto);
  uow.auditar({
    entidade: 'uh_indisponivel',
    registroId: id,
    acao: 'marcar',
    hotelId: m.hotelId,
    depois: { localId: m.localId, chamadoId: m.chamadoId, inicio: m.inicio.toISOString() },
  });
  uow.publicar({
    tipo: 'uh.indisponivel',
    entidade: 'local',
    registroId: m.localId,
    payload: { hotelId: m.hotelId, periodoId: id, chamadoId: m.chamadoId },
  });
  return { id };
}

/** Só o período ainda aberto; já liberado: uh_indisponivel_nao_aberta; invisível ou sem permissão: 404. */
export async function liberarUh(uow: UnidadeDeTrabalho, l: LiberacaoDeUh): Promise<void> {
  if (!uow.usuarioId) throw new Error('UH indisponível exige usuário no contexto.');
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.uh_indisponivel')
    .set({ fim: l.fim, encerrada_por: uow.usuarioId, atualizado_em: agoraNaGravacao(uow) })
    .where('id', '=', l.id)
    .where('fim', 'is', null)
    .returning(['local_id', 'chamado_id'])
    .executeTakeFirst();
  if (!r) {
    const atual = await tx
      .selectFrom('app.uh_indisponivel')
      .select('fim')
      .where('id', '=', l.id)
      .executeTakeFirst();
    if (atual && atual.fim !== null) {
      throw new Conflito(
        'uh_indisponivel_nao_aberta',
        'A UH não está indisponível por este chamado.',
      );
    }
    throw new NaoEncontrado('uh_indisponivel_nao_encontrada', 'Período não encontrado.');
  }
  auditarLiberacao(uow, { ...l, localId: r.local_id, chamadoId: r.chamado_id });
}

function auditarLiberacao(
  uow: UnidadeDeTrabalho,
  l: LiberacaoDeUh & { localId: string; chamadoId: string },
) {
  uow.auditar({
    entidade: 'uh_indisponivel',
    registroId: l.id,
    acao: 'liberar',
    hotelId: l.hotelId,
    antes: { fim: null },
    depois: { fim: l.fim.toISOString() },
  });
  uow.publicar({
    tipo: 'uh.liberada',
    entidade: 'local',
    registroId: l.localId,
    payload: { hotelId: l.hotelId, periodoId: l.id, chamadoId: l.chamadoId },
  });
}

/**
 * No cancelamento do chamado: encerra nesta hora o período aberto da UH, se
 * houver. O cálculo dos UH-dias deixa o período do chamado cancelado de fora.
 */
export async function liberarUhDoChamadoCancelado(
  uow: UnidadeDeTrabalho,
  g: { chamadoId: string; hotelId: string; fim: Date },
): Promise<void> {
  if (!uow.usuarioId) throw new Error('UH indisponível exige usuário no contexto.');
  const linhas = await transacaoDe(uow)
    .updateTable('app.uh_indisponivel')
    // O período com início adiantado (relógio do aparelho, dentro da folga)
    // encerra um instante depois do início, para o check do fim valer.
    .set({
      fim: sql<Date>`greatest(${g.fim}::timestamptz, inicio + interval '1 millisecond')`,
      encerrada_por: uow.usuarioId,
      atualizado_em: agoraNaGravacao(uow),
    })
    .where('chamado_id', '=', g.chamadoId)
    .where('fim', 'is', null)
    .returning(['id', 'local_id', 'fim'])
    .execute();
  for (const r of linhas) {
    auditarLiberacao(uow, {
      id: r.id,
      hotelId: g.hotelId,
      fim: r.fim ?? g.fim,
      localId: r.local_id,
      chamadoId: g.chamadoId,
    });
  }
}
