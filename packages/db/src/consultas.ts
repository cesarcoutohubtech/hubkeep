// Consultas de leitura usadas pelos apps. Recebem a transação de withContext:
// o que cada uma devolve já está recortado pela RLS ao escopo de quem pergunta.
// Ficam aqui para que os apps não montem query Kysely (CLAUDE.md: "apps não
// importam Kysely").
import { sql } from 'kysely';
import type { Tx } from './conexao';

/**
 * O usuário do contexto pode convidar membros? É a mesma pergunta que a policy
 * de INSERT de app.membro faz (Admin do grupo, ou Implantador em algum hotel),
 * feita às mesmas funções authz.* — sem reimplementar a regra aqui. Existe
 * para o convite recusar ANTES de acionar o provedor de identidade: senão
 * qualquer usuário autenticado dispararia e-mails de convite, mesmo com a
 * gravação do membro recusada depois. A regra completa de concessão (qual papel
 * e em que escopo), com mensagem clara, é da F0-06; a RLS continua valendo.
 */
export async function podeConvidar(tx: Tx): Promise<boolean> {
  const r = await sql<{ pode: boolean }>`
    select authz.eh_admin_grupo()
        or exists (select 1 from authz.hoteis_com_papel(array['implantador']::app.papel[]))
        as pode`.execute(tx);
  return r.rows[0]?.pode === true;
}

export interface HotelVisivel {
  id: string;
  nome: string;
  status: string;
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
