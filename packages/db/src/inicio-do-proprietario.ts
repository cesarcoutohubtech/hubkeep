// Leitura do cartão "UHs acompanhadas" da tela inicial (1c, seção 4 da
// paridade). Só leitura, com withContext. Os vínculos vêm das funções de
// escopo (authz.hoteis_proprietario e authz.locais_proprietario), porque a RLS
// não mostra ao proprietário as tabelas de vínculo; o hotel e as UHs, pela RLS.
import type { PortaInicioDoProprietario } from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';

export function criarPortaInicioDoProprietario(banco: AcessoBanco): PortaInicioDoProprietario {
  return {
    vinculos: (ctx) =>
      banco.withContext(ctx, async (tx) => {
        const linhas = await tx
          .selectFrom('app.hotel as h')
          .select([
            'h.id',
            'h.nome',
            sql<boolean>`h.id in (select authz.hoteis_proprietario())`.as('hotel_inteiro'),
            sql<number>`(select count(*)::int from app.local l
              where l.hotel_id = h.id and l.tipo = 'uh' and l.status = 'ativo'
                and l.id in (select lp.local_id from authz.locais_proprietario() lp))`.as('uhs'),
          ])
          .where('h.status', '=', 'ativo')
          .where(
            sql<boolean>`(h.id in (select authz.hoteis_proprietario())
              or h.id in (select lp.hotel_id from authz.locais_proprietario() lp))`,
          )
          .orderBy('h.nome')
          .orderBy('h.id')
          .execute();
        return linhas.map((h) => ({
          hotelId: h.id,
          hotelNome: h.nome,
          hotelInteiro: h.hotel_inteiro,
          uhs: h.uhs,
        }));
      }),
  };
}
