// Registro dos anexos (fase 1a, B4; ADR-024), na unit of work, com auditoria e
// evento. O arquivo já está no Storage; aqui só se grava a quem ele pertence.
// A RLS decide por último: sem escrita no hotel, o INSERT é recusado (42501) e
// o UPDATE da remoção não acha linha. O check anexo_caminho_do_registro recusa
// um caminho que não seja do tenant, do hotel e do registro da linha.
import type { DadosDeAnexo } from '@hubkeep/aplicacao';
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

function arquivoRepetido(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (
    code === '23505' &&
    (constraint === 'anexo_caminho_key' || constraint === 'anexo_miniatura_caminho_key')
  ) {
    throw new Conflito('anexo_ja_registrado', 'Este arquivo já foi registrado.');
  }
  throw e;
}

export async function registrarAnexo(
  uow: UnidadeDeTrabalho,
  d: DadosDeAnexo,
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Registro de anexo exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.anexo')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: d.hotelId,
      entidade: d.entidade,
      local_id: d.entidade === 'local' ? d.registroId : null,
      ativo_id: d.entidade === 'ativo' ? d.registroId : null,
      chamado_id: d.entidade === 'chamado' ? d.registroId : null,
      caminho: d.caminho,
      miniatura_caminho: d.miniaturaCaminho,
      tipo: d.tipo,
      nome: d.nome,
      usuario_id: uow.usuarioId,
    })
    .execute()
    .catch(arquivoRepetido);
  uow.auditar({
    entidade: 'anexo',
    registroId: id,
    acao: 'criar',
    hotelId: d.hotelId,
    depois: {
      entidade: d.entidade,
      registroId: d.registroId,
      caminho: d.caminho,
      miniaturaCaminho: d.miniaturaCaminho,
      tipo: d.tipo,
      nome: d.nome,
    },
  });
  uow.publicar({
    tipo: 'anexo.registrado',
    entidade: 'anexo',
    registroId: id,
    payload: { hotelId: d.hotelId, entidade: d.entidade, registroId: d.registroId, tipo: d.tipo },
  });
  return { id };
}

export async function removerAnexo(uow: UnidadeDeTrabalho, id: string): Promise<void> {
  if (!uow.usuarioId) throw new Error('Remoção de anexo exige usuário no contexto.');
  const r = await transacaoDe(uow)
    .updateTable('app.anexo')
    .set({ removido_em: sql`now()`, removido_por: uow.usuarioId })
    .where('id', '=', id)
    .where('removido_em', 'is', null)
    .returning(['hotel_id', 'entidade', 'local_id', 'ativo_id', 'chamado_id', 'caminho'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('anexo_nao_encontrado', 'Anexo não encontrado.');
  const registroId = r.chamado_id ?? r.ativo_id ?? r.local_id ?? r.hotel_id;
  uow.auditar({
    entidade: 'anexo',
    registroId: id,
    acao: 'remover',
    hotelId: r.hotel_id,
    antes: { entidade: r.entidade, registroId, caminho: r.caminho },
  });
  uow.publicar({
    tipo: 'anexo.removido',
    entidade: 'anexo',
    registroId: id,
    payload: { hotelId: r.hotel_id, entidade: r.entidade, registroId },
  });
}
