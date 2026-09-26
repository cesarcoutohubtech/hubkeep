// Staging do conector (F0-08, ADR-008), papel hk_ingestao. Não é dado de
// negócio: não passa pela unit of work (hk_ingestao nem enxerga app). O
// registro do que chegou é a própria staging.carga.
//
// Idempotência em dois níveis:
//   - lote: staging.carga é única por (tenant, fonte, entidade, lote_hash);
//     lote repetido devolve a carga existente e não reprocessa nada;
//   - registro: upsert por (tenant, fonte, entidade, chave), e só regrava
//     quando o hash do conteúdo mudou.
import type { RegistroComHash, ResultadoDoLote } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import type { Tx } from '../conexao';
import { novoId } from '../ids';

/** Hashes das credenciais do tenant; a RLS de hk_ingestao só mostra as não revogadas. */
export async function credenciaisAtivas(tx: Tx): Promise<{ id: string; hash: string }[]> {
  const linhas = await tx
    .selectFrom('staging.credencial_agente')
    .select(['id', 'hash_segredo'])
    .execute();
  return linhas.map((l) => ({ id: l.id, hash: l.hash_segredo }));
}

export async function registrarLote(
  tx: Tx,
  tenantId: string,
  lote: { fonte: string; entidade: string; registros: readonly RegistroComHash[] },
  loteHash: string,
): Promise<ResultadoDoLote> {
  const cargaId = novoId();
  const inserida = await tx
    .insertInto('staging.carga')
    .values({
      id: cargaId,
      tenant_id: tenantId,
      fonte: lote.fonte,
      entidade: lote.entidade,
      lote_hash: loteHash,
    })
    .onConflict((oc) => oc.columns(['tenant_id', 'fonte', 'entidade', 'lote_hash']).doNothing())
    .returning('id')
    .executeTakeFirst();

  if (!inserida) {
    const existente = await tx
      .selectFrom('staging.carga')
      .select('id')
      .where('fonte', '=', lote.fonte)
      .where('entidade', '=', lote.entidade)
      .where('lote_hash', '=', loteHash)
      .executeTakeFirstOrThrow();
    return { cargaId: existente.id, novo: false };
  }

  await tx
    .insertInto('staging.registro_externo')
    .values(
      lote.registros.map((r) => ({
        tenant_id: tenantId,
        fonte: lote.fonte,
        entidade: lote.entidade,
        chave: r.chave,
        payload: JSON.stringify(r.dados),
        hash: r.hash,
      })),
    )
    .onConflict((oc) =>
      oc
        .columns(['tenant_id', 'fonte', 'entidade', 'chave'])
        .doUpdateSet((eb) => ({
          payload: eb.ref('excluded.payload'),
          hash: eb.ref('excluded.hash'),
          recebido_em: sql`now()`,
        }))
        .where('staging.registro_externo.hash', '<>', (eb) => eb.ref('excluded.hash')),
    )
    .execute();

  await tx
    .updateTable('staging.carga')
    .set({ finalizada_em: sql`now()`, linhas: lote.registros.length })
    .where('id', '=', cargaId)
    .execute();

  return { cargaId, novo: true };
}
