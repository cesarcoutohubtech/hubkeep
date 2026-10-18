// Mews V1: status administrativo agregado, somente leitura (ADR-048, adendo 0056).
// Nenhum segredo, digest, identificador externo, Notes ou dado de hospede sai daqui.
// A RLS do PostgreSQL e o papel hk_app sao as fontes finais de autorizacao.
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';
import type { Contexto } from './conexao';

export interface LinhaDoStatusMews {
  hotelId: string;
  nome: string;
  versao: string | null;
  ultimoUpdatedUtc: string | null;
  ultimoSweepUtc: string | null;
  concluidoEm: string | null;
  recursosAtivos: number;
  bloqueiosOutOfOrder: number;
  bloqueiosInternalUse: number;
}

export interface StatusAdministrativoMews {
  hoteis: LinhaDoStatusMews[];
}

export function criarPortaStatusAdministrativoMews(banco: AcessoBanco) {
  return {
    listar: (ctx: Contexto): Promise<StatusAdministrativoMews | null> =>
      banco.withContext(ctx, async (tx) => {
        // Mesmo gate que as policies RLS. Nao transformar "sem vinculos"
        // em resposta 200 para gerentes, tecnicos ou tenants falsos.
        const papel = await sql<{
          autorizado: boolean;
        }>`select authz.eh_admin_grupo() as autorizado`.execute(tx);
        if (papel.rows[0]?.autorizado !== true) return null;

        const vinculos = await tx
          .selectFrom('app.mews_vinculo')
          .select('hotel_id')
          .where('revogado_em', 'is', null)
          .execute();
        if (vinculos.length === 0) return { hoteis: [] };
        const ids = vinculos.map((v) => v.hotel_id);
        const [hoteis, checkpoints, recursos, bloqueios] = await Promise.all([
          tx.selectFrom('app.hotel').select(['id', 'nome']).where('id', 'in', ids).execute(),
          tx
            .selectFrom('app.mews_checkpoint')
            .select([
              'hotel_id',
              'versao',
              'ultimo_updated_utc',
              'ultimo_sweep_utc',
              'concluido_em',
            ])
            .where('hotel_id', 'in', ids)
            .execute(),
          tx
            .selectFrom('app.mews_recurso')
            .select(['hotel_id', sql<number>`count(*)::integer`.as('total')])
            .where('hotel_id', 'in', ids)
            .where('ativo', '=', true)
            .groupBy('hotel_id')
            .execute(),
          tx
            .selectFrom('app.mews_bloqueio')
            .select(['hotel_id', 'tipo', sql<number>`count(*)::integer`.as('total')])
            .where('hotel_id', 'in', ids)
            .where('ativo', '=', true)
            .groupBy(['hotel_id', 'tipo'])
            .execute(),
        ]);

        const cp = new Map(checkpoints.map((c) => [c.hotel_id, c]));
        const rec = new Map(recursos.map((r) => [r.hotel_id, r.total]));
        const fora = new Map(
          bloqueios.filter((b) => b.tipo === 'OutOfOrder').map((b) => [b.hotel_id, b.total]),
        );
        const uso = new Map(
          bloqueios.filter((b) => b.tipo === 'InternalUse').map((b) => [b.hotel_id, b.total]),
        );

        return {
          hoteis: hoteis
            .map((h) => {
              const c = cp.get(h.id);
              return {
                hotelId: h.id,
                nome: h.nome,
                versao: c ? String(c.versao) : null,
                ultimoUpdatedUtc: c?.ultimo_updated_utc?.toISOString() ?? null,
                ultimoSweepUtc: c?.ultimo_sweep_utc?.toISOString() ?? null,
                concluidoEm: c?.concluido_em?.toISOString() ?? null,
                recursosAtivos: rec.get(h.id) ?? 0,
                bloqueiosOutOfOrder: fora.get(h.id) ?? 0,
                bloqueiosInternalUse: uso.get(h.id) ?? 0,
              };
            })
            .sort((a, b) => a.nome.localeCompare(b.nome)),
        };
      }),
  };
}
