// Consultas de leitura usadas pelos apps. Recebem a transação de withContext:
// o que cada uma devolve já está recortado pela RLS ao escopo de quem pergunta.
// Ficam aqui para que os apps não montem query Kysely (CLAUDE.md: "apps não
// importam Kysely").
import { sql } from 'kysely';
import type { Escopo } from '@hubkeep/dominio';
import type { Tx } from './conexao';
import type { AppHotelStatus } from './tipos-banco';

export interface HotelVisivel {
  id: string;
  nome: string;
  status: AppHotelStatus;
  bandeiraId: string | null;
}

export const listarHoteisVisiveis = (tx: Tx): Promise<HotelVisivel[]> =>
  tx
    .selectFrom('app.hotel')
    .select(['id', 'nome', 'status', 'bandeira_id as bandeiraId'])
    .orderBy('nome')
    .execute();

/** Nome do tenant do contexto, ou null se o usuário não é membro ativo dele. */
export async function nomeDoTenant(tx: Tx): Promise<string | null> {
  const t = await tx.selectFrom('app.tenant').select('nome').executeTakeFirst();
  return t?.nome ?? null;
}

/**
 * Preferências do próprio usuário (a RLS só mostra a dele) e os padrões do
 * tenant do contexto. tenant null: o usuário não é membro ativo dele.
 */
export async function preferenciasDoUsuario(tx: Tx) {
  const membro = await tx
    .selectFrom('app.preferencia_membro')
    .select(['idioma', 'formato_regional', 'fuso'])
    .executeTakeFirst();
  const tenant = await tx
    .selectFrom('app.tenant')
    .select(['idioma_padrao', 'moeda', 'pais'])
    .executeTakeFirst();
  return {
    membro: membro
      ? { idioma: membro.idioma, formatoRegional: membro.formato_regional, fuso: membro.fuso }
      : null,
    tenant: tenant
      ? { idiomaPadrao: tenant.idioma_padrao, moeda: tenant.moeda, pais: tenant.pais }
      : null,
  };
}

/** Resposta guardada de uma operação offline do próprio usuário, se a chave já veio. */
export async function respostaDaOperacao(
  tx: Tx,
  chave: string,
): Promise<Record<string, string | number | boolean | null> | null> {
  const linha = await tx
    .selectFrom('app.operacao_offline')
    .select('resposta')
    .where('chave', '=', chave)
    .executeTakeFirst();
  return (linha?.resposta as Record<string, string | number | boolean | null> | undefined) ?? null;
}

/**
 * Já existe membro com este usuário ou este e-mail no tenant do contexto?
 * (Reconvite vira 409, não erro de chave.)
 */
export async function ehMembro(
  tx: Tx,
  quem: { usuarioId: string } | { email: string },
): Promise<boolean> {
  let consulta = tx.selectFrom('app.membro').select('usuario_id');
  consulta =
    'usuarioId' in quem
      ? consulta.where('usuario_id', '=', quem.usuarioId)
      : consulta.where(sql<string>`lower(email)`, '=', quem.email.toLowerCase());
  return (await consulta.executeTakeFirst()) !== undefined;
}

/**
 * O escopo existe e é visível para quem pergunta? Pela RLS: hotel, bandeira ou
 * proprietário de outro tenant (ou fora do alcance de quem pergunta) não
 * aparece. É a etapa (b) do convite: escopo invisível → 404 sem tocar no Auth.
 */
export async function escopoVisivel(tx: Tx, escopo: Escopo): Promise<boolean> {
  switch (escopo.tipo) {
    case 'grupo':
      return true;
    case 'hotel':
      return (
        (await tx
          .selectFrom('app.hotel')
          .select('id')
          .where('id', '=', escopo.hotelId)
          .executeTakeFirst()) !== undefined
      );
    case 'bandeira':
      return (
        (await tx
          .selectFrom('app.bandeira')
          .select('id')
          .where('id', '=', escopo.bandeiraId)
          .executeTakeFirst()) !== undefined
      );
    case 'proprietario':
      return (
        (await tx
          .selectFrom('app.proprietario')
          .select('id')
          .where('id', '=', escopo.proprietarioId)
          .executeTakeFirst()) !== undefined
      );
  }
}

/** Hotel do registro, se o usuário do contexto o enxerga (RLS); senão null. */
export async function hotelDoRegistro(
  tx: Tx,
  entidade: 'hotel' | 'local' | 'ativo' | 'chamado' | 'os',
  registroId: string,
): Promise<string | null> {
  if (entidade === 'hotel') {
    const h = await tx
      .selectFrom('app.hotel')
      .select('id')
      .where('id', '=', registroId)
      .executeTakeFirst();
    return h?.id ?? null;
  }
  if (entidade === 'os') {
    const o = await tx
      .selectFrom('app.os')
      .select('hotel_id')
      .where('id', '=', registroId)
      .executeTakeFirst();
    return o?.hotel_id ?? null;
  }
  if (entidade === 'chamado') {
    const c = await tx
      .selectFrom('app.chamado')
      .select('hotel_id')
      .where('id', '=', registroId)
      .executeTakeFirst();
    return c?.hotel_id ?? null;
  }
  if (entidade === 'ativo') {
    const a = await tx
      .selectFrom('app.ativo')
      .select('hotel_id')
      .where('id', '=', registroId)
      .executeTakeFirst();
    return a?.hotel_id ?? null;
  }
  const l = await tx
    .selectFrom('app.local')
    .select('hotel_id')
    .where('id', '=', registroId)
    .executeTakeFirst();
  return l?.hotel_id ?? null;
}

/**
 * O hotel está entre os que o usuário escreve (ou lê)? A pergunta vai às
 * mesmas funções authz.* das policies, sem reimplementar a regra (ADR-017).
 */
export async function hotelNoEscopo(
  tx: Tx,
  hotelId: string,
  modo: 'escrita' | 'leitura',
): Promise<boolean> {
  const r =
    modo === 'escrita'
      ? await sql<{
          ok: boolean;
        }>`select ${hotelId}::uuid in (select authz.hoteis_escrita()) as ok`.execute(tx)
      : await sql<{
          ok: boolean;
        }>`select ${hotelId}::uuid in (select authz.hoteis_leitura()) as ok`.execute(tx);
  return r.rows[0]?.ok === true;
}
