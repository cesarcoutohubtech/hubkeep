// Leituras da situação por hotel da tela inicial (1c, seção 4 da paridade).
// Só leitura, com withContext: a RLS decide que OS e chamados o usuário lê.
// O corte fino (a preventiva atrasada pela tolerância e o dia no fuso de cada
// hotel) é do domínio; aqui vem só o recorte que pode contar.
import type { PortaSituacaoPorHotel } from '@hubkeep/aplicacao';
import { ESTADOS_DA_PREVENTIVA_ABERTA, type EstadoDaOs } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { AcessoBanco } from './acesso';

export function criarPortaSituacaoPorHotel(banco: AcessoBanco): PortaSituacaoPorHotel {
  return {
    preventivasAbertas: (ctx, hotelIds, ateDia) =>
      banco.withContext(ctx, async (tx) => {
        if (hotelIds.length === 0) return [];
        const linhas = await tx
          .selectFrom('app.os as o')
          .select([
            'o.hotel_id',
            'o.estado',
            sql<string>`o.data_prevista::text`.as('data_prevista'),
          ])
          .where('o.hotel_id', 'in', [...hotelIds])
          .where('o.plano_id', 'is not', null)
          .where('o.estado', 'in', [...ESTADOS_DA_PREVENTIVA_ABERTA])
          .where(sql<boolean>`o.data_prevista <= ${ateDia}::date`)
          .execute();
        return linhas.map((o) => ({
          hotelId: o.hotel_id,
          dataPrevista: o.data_prevista,
          estado: o.estado as EstadoDaOs,
        }));
      }),

    aberturas: (ctx, hotelIds, desde) =>
      banco.withContext(ctx, async (tx) => {
        if (hotelIds.length === 0) return [];
        const linhas = await tx
          .selectFrom('app.chamado as c')
          .select(['c.hotel_id', 'c.criado_em'])
          .where('c.hotel_id', 'in', [...hotelIds])
          .where('c.estado', '<>', 'cancelado')
          .where('c.criado_em', '>=', desde)
          .execute();
        return linhas.map((c) => ({ hotelId: c.hotel_id, abertoEm: c.criado_em }));
      }),
  };
}
