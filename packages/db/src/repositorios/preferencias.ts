// Preferências de idioma e região do próprio membro (F0-10b). A RLS só deixa
// gravar a linha do usuário do contexto; a auditoria vai sem hotel, pela regra
// de autoauditoria da migração 0005. Não há evento de domínio: ninguém reage.
import { sql } from 'kysely';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

export async function gravarPreferencias(
  uow: UnidadeDeTrabalho,
  p: { idioma: string | null; formatoRegional: string | null; fuso: string | null },
): Promise<void> {
  if (!uow.usuarioId) throw new Error('Preferências exigem um usuário na sessão.');
  const colunas = { idioma: p.idioma, formato_regional: p.formatoRegional, fuso: p.fuso };
  await transacaoDe(uow)
    .insertInto('app.preferencia_membro')
    .values({ tenant_id: uow.tenantId, usuario_id: uow.usuarioId, ...colunas })
    .onConflict((oc) =>
      oc
        .columns(['tenant_id', 'usuario_id'])
        .doUpdateSet({ ...colunas, atualizado_em: sql`now()` }),
    )
    .execute();
  uow.auditar({
    entidade: 'preferencia_membro',
    registroId: uow.usuarioId,
    acao: 'gravar',
    hotelId: null,
    depois: p,
  });
}
