// Leituras do hotel numa transação já aberta, usadas pelos adaptadores (com o
// contexto do usuário) e pelos repositórios dos jobs (com o hk_worker): as
// políticas ativas do hotel, da bandeira e do grupo, e o que o calendário de
// SLA lê (1c, ADR-042). Só leitura.
import type { DadosDoCalendario } from '@hubkeep/aplicacao';
import type { NiveisDePolitica } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { Tx } from './conexao';

/**
 * As políticas ativas de um hotel: as do grupo, as da bandeira do hotel (1c) e
 * as do próprio hotel. A bandeira sai de app.hotel na mesma consulta; hotel sem
 * bandeira não tem esse nível.
 */
export const politicasDoHotel = (tx: Tx, hotelId: string) =>
  tx
    .selectFrom('app.politica')
    .where('ativa', '=', true)
    .where((eb) =>
      eb.or([
        eb('escopo_tipo', '=', 'grupo'),
        eb.and([
          eb('escopo_tipo', '=', 'bandeira'),
          eb(
            'bandeira_id',
            '=',
            eb.selectFrom('app.hotel').select('bandeira_id').where('id', '=', hotelId),
          ),
        ]),
        eb.and([eb('escopo_tipo', '=', 'hotel'), eb('hotel_id', '=', hotelId)]),
      ]),
    );

/**
 * O que o calendário de SLA lê do hotel (1c, ADR-042): o fuso, a região do
 * hotel e a do tenant (a herança é do domínio) e os feriados ativos, com a
 * data como aaaa-mm-dd, sem passar por Date e fuso.
 */
export const dadosDoCalendarioNaTransacao = async (
  tx: Tx,
  hotelId: string,
): Promise<DadosDoCalendario | null> => {
  const h = await tx
    .selectFrom('app.hotel as h')
    .innerJoin('app.tenant as t', 't.id', 'h.tenant_id')
    .select([
      'h.fuso',
      'h.pais',
      'h.subdivisao',
      't.pais as tenant_pais',
      't.subdivisao as tenant_subdivisao',
    ])
    .where('h.id', '=', hotelId)
    .executeTakeFirst();
  if (!h) return null;
  const feriados = await tx
    .selectFrom('app.feriado_hotel')
    .select([sql<string>`data::text`.as('data'), 'anual'])
    .where('hotel_id', '=', hotelId)
    .where('ativo', '=', true)
    .execute();
  return {
    fuso: h.fuso,
    hotel: { pais: h.pais, subdivisao: h.subdivisao },
    tenant: { pais: h.tenant_pais, subdivisao: h.tenant_subdivisao },
    feriados,
  };
};

/** As políticas de um hotel numa transação já aberta (o worker do monitor de SLA). */
export async function niveisDaPoliticaNaTransacao(
  tx: Tx,
  hotelId: string,
  chave: string,
): Promise<NiveisDePolitica> {
  const linhas = await politicasDoHotel(tx, hotelId)
    .select(['escopo_tipo', 'valor'])
    .where('chave', '=', chave)
    .execute();
  const niveis: NiveisDePolitica = {};
  for (const l of linhas) {
    if (l.escopo_tipo === 'hotel') niveis.hotel = l.valor;
    else if (l.escopo_tipo === 'bandeira') niveis.bandeira = l.valor;
    else if (l.escopo_tipo === 'grupo') niveis.grupo = l.valor;
  }
  return niveis;
}
