// Auditoria geral (fase 1c). Só leitura, com withContext: a RLS de
// app.auditoria decide que linhas o usuário lê (ADR-021, migrações 0003, 0028,
// 0033 e 0040). A consulta fica, além disso, só com os hotéis em que ele é da
// gestão (decisão 12 do Cesar de 13/10/2026), pela mesma função authz das
// policies (ADR-017), sem reimplementar a regra: o Gerente que também é
// Técnico de outro hotel não vê a auditoria desse outro hotel aqui. As linhas
// sem hotel ficam só pela RLS. O nome do hotel e o de quem gravou vêm por left
// join: sem leitura, volta null, sem esconder a linha.
// A ordem (em desc, id desc) e o cursor usam o `em` exato, com microssegundos.
import type {
  FiltroDaAuditoria,
  LinhaDaAuditoriaGeral,
  PortaAuditoriaGeral,
} from '@hubkeep/aplicacao';
import { PAPEIS_DA_AUDITORIA_GERAL } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';

const papeisDaGestao = sql.join(PAPEIS_DA_AUDITORIA_GERAL.map((p) => sql.lit(p)));

export function criarPortaAuditoriaGeral(banco: AcessoBanco): PortaAuditoriaGeral {
  return {
    pagina: (ctx, filtro: FiltroDaAuditoria, depoisDe, limite) =>
      banco.withContext(ctx, async (tx): Promise<LinhaDaAuditoriaGeral[]> => {
        let q = tx
          .selectFrom('app.auditoria as a')
          .leftJoin('app.membro as m', (j) =>
            j.onRef('m.tenant_id', '=', 'a.tenant_id').onRef('m.usuario_id', '=', 'a.usuario_id'),
          )
          .leftJoin('app.hotel as h', (j) =>
            j.onRef('h.tenant_id', '=', 'a.tenant_id').onRef('h.id', '=', 'a.hotel_id'),
          )
          .select([
            'a.id',
            'a.em',
            sql<string>`to_char(a.em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
              'em_exato',
            ),
            'a.hotel_id',
            'h.nome as hotel_nome',
            'a.entidade',
            'a.registro_id',
            'a.acao',
            'a.usuario_id',
            'm.nome as usuario_nome',
            'a.antes',
            'a.depois',
          ])
          .where('a.em', '>=', filtro.de)
          .where('a.em', '<', filtro.ate)
          .where(
            sql<boolean>`(a.hotel_id is null or a.hotel_id in (select authz.hoteis_com_papel(array[${papeisDaGestao}]::app.papel[])))`,
          );
        if (filtro.hotelId) q = q.where('a.hotel_id', '=', filtro.hotelId);
        if (filtro.entidade) q = q.where('a.entidade', '=', filtro.entidade);
        if (filtro.acao) q = q.where('a.acao', '=', filtro.acao);
        if (filtro.pessoa === 'sistema') q = q.where('a.usuario_id', 'is', null);
        else if (filtro.pessoa) q = q.where('a.usuario_id', '=', filtro.pessoa);
        if (depoisDe) {
          const em = sql<Date>`${depoisDe.em}::timestamptz`;
          q = q.where((eb) =>
            eb.or([
              eb('a.em', '<', em),
              eb.and([eb('a.em', '=', em), eb('a.id', '<', depoisDe.id)]),
            ]),
          );
        }
        const linhas = await q
          .orderBy('a.em', 'desc')
          .orderBy('a.id', 'desc')
          .limit(limite)
          .execute();
        return linhas.map((l) => ({
          id: l.id,
          em: l.em,
          emExato: l.em_exato,
          hotelId: l.hotel_id,
          hotelNome: l.hotel_nome,
          entidade: l.entidade,
          registroId: l.registro_id,
          acao: l.acao,
          usuarioId: l.usuario_id,
          usuarioNome: l.usuario_nome,
          antes: l.antes,
          depois: l.depois,
        }));
      }),
  };
}
