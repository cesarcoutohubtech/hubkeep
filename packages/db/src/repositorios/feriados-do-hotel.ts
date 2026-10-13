// Feriados do hotel (fase 1c; ADR-042), na unit of work, com auditoria. A RLS
// de app.feriado_hotel decide por último (migração 0043): fora da gestão do
// hotel e do Implantador, o INSERT é recusado (42501) e o UPDATE não acha
// linha. Um feriado ativo por data no hotel (índice feriado_hotel_data_unica).
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { sql } from 'kysely';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

function dataRepetida(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'feriado_hotel_data_unica') {
    throw new Conflito('feriado_data_repetida', 'Já existe feriado ativo nesta data no hotel.');
  }
  throw e;
}

export async function criarFeriadoDoHotel(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  f: { data: string; nome: string; anual: boolean },
): Promise<{ id: string }> {
  if (!uow.usuarioId) throw new Error('Cadastro de feriado exige usuário no contexto.');
  const id = novoId();
  await transacaoDe(uow)
    .insertInto('app.feriado_hotel')
    .values({
      id,
      tenant_id: uow.tenantId,
      hotel_id: hotelId,
      data: f.data,
      nome: f.nome,
      anual: f.anual,
      criado_por: uow.usuarioId,
    })
    .execute()
    .catch(dataRepetida);
  uow.auditar({ entidade: 'feriado_hotel', registroId: id, acao: 'criar', hotelId, depois: f });
  return { id };
}

export async function alterarFeriadoDoHotel(
  uow: UnidadeDeTrabalho,
  feriadoId: string,
  mudanca: { nome?: string; anual?: boolean; ativo?: boolean },
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.feriado_hotel')
    .select(['nome', 'anual', 'ativo'])
    .where('id', '=', feriadoId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.feriado_hotel')
    .set({ ...mudanca, atualizado_em: sql`now()` })
    .where('id', '=', feriadoId)
    .returning(['hotel_id'])
    .executeTakeFirst()
    .catch(dataRepetida);
  if (!r) throw new NaoEncontrado('feriado_nao_encontrado', 'Feriado não encontrado.');
  const acao =
    mudanca.ativo === false ? 'desativar' : mudanca.ativo === true ? 'reativar' : 'alterar';
  uow.auditar({
    entidade: 'feriado_hotel',
    registroId: feriadoId,
    acao,
    hotelId: r.hotel_id,
    antes,
    depois: mudanca,
  });
}
