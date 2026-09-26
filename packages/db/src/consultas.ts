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
}

export const listarHoteisVisiveis = (tx: Tx): Promise<HotelVisivel[]> =>
  tx.selectFrom('app.hotel').select(['id', 'nome', 'status']).orderBy('nome').execute();

/** Nome do tenant do contexto, ou null se o usuário não é membro ativo dele. */
export async function nomeDoTenant(tx: Tx): Promise<string | null> {
  const t = await tx.selectFrom('app.tenant').select('nome').executeTakeFirst();
  return t?.nome ?? null;
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
