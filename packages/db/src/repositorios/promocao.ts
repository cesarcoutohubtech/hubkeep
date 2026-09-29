// Promoção de UHs do staging para app.local (F0-08), pelo worker (hk_worker),
// numa unit of work por tenant: toda UH criada ou atualizada grava auditoria
// (sem usuário) e evento. A regra de licença é da aplicação; aqui só IO.
import {
  type HotelParaPromocao,
  type LocalExistente,
  type SessaoDePromocao,
  type UhDoStaging,
  buscaDeLocal,
} from '@hubkeep/aplicacao';
import { sql } from 'kysely';
import type { Tx } from '../conexao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

/**
 * Uso da licença de UHs no tenant do contexto: max_uhs do contrato e UHs que
 * contam (tipo 'uh', status 'ativo' — contaComoUh do domínio, a mesma métrica
 * de licenca.uso(); o teste de paridade compara as duas).
 */
export async function usoDeLicenca(tx: Tx): Promise<{ contratadas: number; emUso: number }> {
  const contrato = await tx.selectFrom('licenca.contrato').select('max_uhs').executeTakeFirst();
  const uso = await tx
    .selectFrom('app.local')
    .select(sql<string>`count(*)`.as('n'))
    .where('tipo', '=', 'uh')
    .where('status', '=', 'ativo')
    .executeTakeFirstOrThrow();
  return { contratadas: contrato?.max_uhs ?? 0, emUso: Number(uso.n) };
}

export function sessaoDePromocao(uow: UnidadeDeTrabalho): SessaoDePromocao {
  const tx = transacaoDe(uow);
  return {
    async uhsDoStaging(): Promise<UhDoStaging[]> {
      const linhas = await tx
        .selectFrom('staging.registro_externo')
        .select(['fonte', 'chave', 'payload'])
        .where('entidade', '=', 'uh')
        .orderBy('fonte')
        .orderBy('chave')
        .execute();
      return linhas.map((l) => ({ fonte: l.fonte, chave: l.chave, dados: l.payload }));
    },

    async hoteisPorCodigo() {
      const linhas = await tx
        .selectFrom('app.hotel')
        .select(['id', 'status', 'sistema_origem', 'cod_externo'])
        .where('sistema_origem', 'is not', null)
        .where('cod_externo', 'is not', null)
        .execute();
      return new Map<string, HotelParaPromocao>(
        linhas.map((h) => [`${h.sistema_origem}|${h.cod_externo}`, { id: h.id, status: h.status }]),
      );
    },

    async locaisPorCodigo() {
      const linhas = await tx
        .selectFrom('app.local')
        .select(['id', 'hotel_id', 'cod_externo', 'nome', 'andar'])
        .where('cod_externo', 'is not', null)
        .execute();
      return new Map<string, LocalExistente>(
        linhas.map((l) => [
          `${l.hotel_id}|${l.cod_externo}`,
          { id: l.id, nome: l.nome, andar: l.andar },
        ]),
      );
    },

    usoDeLicenca: () => usoDeLicenca(tx),

    async criarUh(uh) {
      const id = novoId();
      await tx
        .insertInto('app.local')
        .values({
          id,
          tenant_id: uow.tenantId,
          hotel_id: uh.hotelId,
          tipo: 'uh',
          nome: uh.nome,
          busca: buscaDeLocal(uh.nome),
          andar: uh.andar,
          status: uh.status,
          cod_externo: uh.chave,
        })
        .execute();
      const depois = {
        id,
        hotelId: uh.hotelId,
        codExterno: uh.chave,
        nome: uh.nome,
        andar: uh.andar,
        status: uh.status,
      };
      uow.auditar({
        entidade: 'local',
        registroId: id,
        acao: 'promover',
        hotelId: uh.hotelId,
        depois,
      });
      uow.publicar({ tipo: 'local.promovido', entidade: 'local', registroId: id, payload: depois });
    },

    async atualizarUh(id, dados) {
      const antes = await tx
        .selectFrom('app.local')
        .select(['hotel_id', 'nome', 'andar'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('app.local')
        .set({
          nome: dados.nome,
          busca: buscaDeLocal(dados.nome),
          andar: dados.andar,
          atualizado_em: sql`now()`,
        })
        .where('id', '=', id)
        .execute();
      uow.auditar({
        entidade: 'local',
        registroId: id,
        acao: 'atualizar_do_sistema_hoteleiro',
        hotelId: antes.hotel_id,
        antes: { nome: antes.nome, andar: antes.andar },
        depois: dados,
      });
      uow.publicar({
        tipo: 'local.atualizado',
        entidade: 'local',
        registroId: id,
        payload: { id, ...dados },
      });
    },
  };
}
