// Repositório de bandeira. Primeiro repositório do pacote e modelo dos
// próximos: recebe a unidade de trabalho (nunca a transação), grava a mudança
// e registra auditoria e evento na própria unidade. Quem pode criar bandeira
// (Admin do grupo) é garantido pela RLS; a regra de negócio vem na F0-06.
import { Conflito, NaoEncontrado } from '@hubkeep/dominio';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export interface Bandeira {
  id: string;
  nome: string;
}

/** Nome repetido no tenant (unique (tenant_id, nome)) vira 409 com código. */
function nomeRepetido(e: unknown): never {
  const { code, constraint } = e as { code?: string; constraint?: string };
  if (code === '23505' && constraint === 'bandeira_tenant_id_nome_key') {
    throw new Conflito('bandeira_nome_repetido', 'Já existe bandeira com este nome.');
  }
  throw e;
}

export async function criarBandeira(uow: UnidadeDeTrabalho, nome: string): Promise<Bandeira> {
  const bandeira = { id: novoId(), nome };
  await transacaoDe(uow)
    .insertInto('app.bandeira')
    .values({ id: bandeira.id, tenant_id: uow.tenantId, nome })
    .execute()
    .catch(nomeRepetido);
  uow.auditar({ entidade: 'bandeira', registroId: bandeira.id, acao: 'criar', depois: bandeira });
  uow.publicar({
    tipo: 'bandeira.criada',
    entidade: 'bandeira',
    registroId: bandeira.id,
    payload: bandeira,
  });
  return bandeira;
}

export async function renomearBandeira(
  uow: UnidadeDeTrabalho,
  id: string,
  nome: string,
): Promise<void> {
  const r = await transacaoDe(uow)
    .updateTable('app.bandeira')
    .set({ nome })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst()
    .catch(nomeRepetido);
  if (!r) throw new NaoEncontrado('bandeira_nao_encontrada', 'Bandeira não encontrada.');
  uow.auditar({ entidade: 'bandeira', registroId: id, acao: 'renomear', depois: { nome } });
}

export async function definirAtivaDaBandeira(
  uow: UnidadeDeTrabalho,
  id: string,
  ativa: boolean,
): Promise<void> {
  const r = await transacaoDe(uow)
    .updateTable('app.bandeira')
    .set({ ativa })
    .where('id', '=', id)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('bandeira_nao_encontrada', 'Bandeira não encontrada.');
  uow.auditar({
    entidade: 'bandeira',
    registroId: id,
    acao: ativa ? 'reativar' : 'desativar',
    depois: { ativa },
  });
  uow.publicar({
    tipo: ativa ? 'bandeira.reativada' : 'bandeira.desativada',
    entidade: 'bandeira',
    registroId: id,
    payload: { bandeiraId: id },
  });
}

/**
 * Troca a bandeira do hotel. O escopo do Gestor CSC da bandeira muda na
 * transação seguinte (ADR-004). A policy de UPDATE de hotel só deixa o Admin.
 */
export async function definirBandeiraDoHotel(
  uow: UnidadeDeTrabalho,
  hotelId: string,
  bandeiraId: string | null,
): Promise<void> {
  const tx = transacaoDe(uow);
  const antes = await tx
    .selectFrom('app.hotel')
    .select('bandeira_id')
    .where('id', '=', hotelId)
    .executeTakeFirst();
  const r = await tx
    .updateTable('app.hotel')
    .set({ bandeira_id: bandeiraId, atualizado_em: new Date() })
    .where('id', '=', hotelId)
    .returning(['id'])
    .executeTakeFirst();
  if (!r) throw new NaoEncontrado('hotel_nao_encontrado', 'Hotel não encontrado.');
  uow.auditar({
    entidade: 'hotel',
    registroId: hotelId,
    acao: 'trocar_bandeira',
    hotelId,
    antes: { bandeiraId: antes?.bandeira_id ?? null },
    depois: { bandeiraId },
  });
  uow.publicar({
    tipo: 'hotel.alterado',
    entidade: 'hotel',
    registroId: hotelId,
    payload: { hotelId, bandeiraId },
  });
}
