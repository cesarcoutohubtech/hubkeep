// Proprietários e vínculos (fase 1a, A4; ADR-031), na unit of work, com
// auditoria. Nome e documento são dado pessoal (LGPD): a auditoria guarda que
// mudaram, não o valor. A RLS decide por último: só o Admin do grupo grava.
import type { Proprietario, TipoDeVinculo } from '@hubkeep/aplicacao';
import { NaoEncontrado, type Vigencia } from '@hubkeep/dominio';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function criarProprietario(
  uow: UnidadeDeTrabalho,
  dados: Omit<Proprietario, 'id'>,
): Promise<{ id: string }> {
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.proprietario')
    .values({ id, tenant_id: uow.tenantId, nome: dados.nome, documento: dados.documento })
    .execute();
  uow.auditar({
    entidade: 'proprietario',
    registroId: id,
    acao: 'criar',
    depois: { documentoInformado: dados.documento !== null },
  });
  return { id };
}

export async function alterarProprietario(
  uow: UnidadeDeTrabalho,
  id: string,
  dados: Omit<Proprietario, 'id'>,
): Promise<void> {
  const r = await transacaoDe(uow)
    .updateTable('app.proprietario')
    .set({ nome: dados.nome, documento: dados.documento })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('proprietario_nao_encontrado', 'Proprietário não encontrado.');
  uow.auditar({
    entidade: 'proprietario',
    registroId: id,
    acao: 'alterar',
    depois: { documentoInformado: dados.documento !== null },
  });
}

export async function vincularProprietario(
  uow: UnidadeDeTrabalho,
  v: {
    tipo: TipoDeVinculo;
    proprietarioId: string;
    hotelId: string;
    localId: string | null;
    vigencia: Vigencia;
  },
): Promise<{ id: string }> {
  const id = novoId();
  const tx = transacaoDe(uow);
  const comum = {
    id,
    tenant_id: uow.tenantId,
    proprietario_id: v.proprietarioId,
    vigencia_inicio: v.vigencia.inicio,
    vigencia_fim: v.vigencia.fim,
  };
  if (v.tipo === 'uh') {
    await tx
      .insertInto('app.local_proprietario')
      .values({ ...comum, local_id: v.localId ?? '' })
      .execute();
  } else {
    await tx
      .insertInto('app.hotel_proprietario')
      .values({ ...comum, hotel_id: v.hotelId })
      .execute();
  }
  uow.auditar({
    entidade: v.tipo === 'uh' ? 'local_proprietario' : 'hotel_proprietario',
    registroId: id,
    acao: 'vincular',
    hotelId: v.hotelId,
    depois: { proprietarioId: v.proprietarioId, localId: v.localId, vigencia: v.vigencia },
  });
  return { id };
}

export async function alterarVigenciaDoVinculo(
  uow: UnidadeDeTrabalho,
  tipo: TipoDeVinculo,
  vinculoId: string,
  vigencia: Vigencia,
): Promise<void> {
  const tabela = tipo === 'uh' ? 'app.local_proprietario' : 'app.hotel_proprietario';
  const r = await transacaoDe(uow)
    .updateTable(tabela)
    .set({ vigencia_inicio: vigencia.inicio, vigencia_fim: vigencia.fim })
    .where('id', '=', vinculoId)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('vinculo_nao_encontrado', 'Vínculo não encontrado.');
  uow.auditar({
    entidade: tipo === 'uh' ? 'local_proprietario' : 'hotel_proprietario',
    registroId: vinculoId,
    acao: 'alterar_vigencia',
    depois: { vigencia },
  });
}
