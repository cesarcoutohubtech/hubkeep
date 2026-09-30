// Parada do equipamento (fase 1a, C5), na unit of work, com auditoria e
// evento. A RLS decide por último (migração 0025): registra quem tem escrita
// no hotel, em nome dele mesmo; encerram a gestão do hotel e o Técnico
// responsável por OS não cancelada do chamado. O índice parada_ativo_uma_aberta
// garante uma parada aberta por ativo.
import type { EncerramentoDeParada, RegistroDeParada } from '@hubkeep/aplicacao';
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/** O índice parada_ativo_uma_aberta recusou: o ativo já tem parada aberta. */
function paradaJaAberta(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'parada_ativo_uma_aberta') {
    throw new Conflito('parada_ja_aberta', 'O ativo já tem uma parada aberta.');
  }
  throw e;
}

function auditarRegistro(
  uow: UnidadeDeTrabalho,
  id: string,
  g: Omit<RegistroDeParada, 'osId'> & { osId: string | null },
) {
  uow.auditar({
    entidade: 'parada_ativo',
    registroId: id,
    acao: 'registrar',
    hotelId: g.hotelId,
    depois: {
      ativoId: g.ativoId,
      chamadoId: g.chamadoId,
      osId: g.osId,
      inicio: g.inicio.toISOString(),
      fim: g.fim?.toISOString() ?? null,
    },
  });
  uow.publicar({
    tipo: 'parada.registrada',
    entidade: 'ativo',
    registroId: g.ativoId,
    payload: { hotelId: g.hotelId, paradaId: id, chamadoId: g.chamadoId, aberta: g.fim === null },
  });
}

/** Na execução (C5): aberta, ou já com o fim; outra aberta no ativo: parada_ja_aberta. */
export async function registrarParada(
  uow: UnidadeDeTrabalho,
  g: RegistroDeParada,
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Parada exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.parada_ativo')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: g.hotelId,
      ativo_id: g.ativoId,
      chamado_id: g.chamadoId,
      os_id: g.osId,
      inicio: g.inicio,
      fim: g.fim,
      aberta_por: uow.usuarioId,
      encerrada_por: g.fim === null ? null : uow.usuarioId,
    })
    .execute()
    .catch(paradaJaAberta);
  auditarRegistro(uow, id, g);
  return { id };
}

/**
 * Na abertura do chamado (C5) e na reabertura da OS com o equipamento parado
 * (C6, com a OS): a parada aberta do ativo. Se o ativo já tem uma aberta,
 * fica a que existe (ON CONFLICT no índice parcial) e a abertura ou a
 * reabertura segue do mesmo jeito; devolve null.
 */
export async function pararNaAbertura(
  uow: UnidadeDeTrabalho,
  g: { hotelId: string; ativoId: string; chamadoId: string; osId?: string; inicio: Date },
): Promise<{ id: string } | null> {
  if (!uow.usuarioId) throw new Error('Parada exige usuário no contexto.');
  const id = novoId();
  const r = await transacaoDe(uow)
    .insertInto('app.parada_ativo')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: g.hotelId,
      ativo_id: g.ativoId,
      chamado_id: g.chamadoId,
      os_id: g.osId ?? null,
      inicio: g.inicio,
      aberta_por: uow.usuarioId,
    })
    .onConflict((oc) => oc.columns(['hotel_id', 'ativo_id']).where('fim', 'is', null).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (!r) return null;
  auditarRegistro(uow, id, { ...g, osId: g.osId ?? null, fim: null });
  return { id };
}

/** Só a parada ainda aberta; já encerrada: parada_nao_aberta; invisível ou sem permissão: 404. */
export async function encerrarParada(
  uow: UnidadeDeTrabalho,
  e: EncerramentoDeParada,
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Parada exige usuário no contexto.');
  const tx = transacaoDe(uow);
  const r = await tx
    .updateTable('app.parada_ativo')
    .set({ fim: e.fim, encerrada_por: uow.usuarioId, atualizado_em: sql`now()` })
    .where('id', '=', e.id)
    .where('fim', 'is', null)
    .returning(['ativo_id', 'chamado_id', 'inicio'])
    .executeTakeFirst();
  if (!r) {
    const atual = await tx
      .selectFrom('app.parada_ativo')
      .select('fim')
      .where('id', '=', e.id)
      .executeTakeFirst();
    if (atual && atual.fim !== null) {
      throw new Conflito('parada_nao_aberta', 'O ativo não tem parada aberta.');
    }
    throw new NaoEncontrado('parada_nao_encontrada', 'Parada não encontrada.');
  }
  uow.auditar({
    entidade: 'parada_ativo',
    registroId: e.id,
    acao: 'encerrar',
    hotelId: e.hotelId,
    antes: { fim: null },
    depois: { fim: e.fim.toISOString() },
  });
  uow.publicar({
    tipo: 'parada.encerrada',
    entidade: 'ativo',
    registroId: r.ativo_id,
    payload: { hotelId: e.hotelId, paradaId: e.id, chamadoId: r.chamado_id },
  });
}
