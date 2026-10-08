// Hotéis a partir do staging (fase 1a, A1): importar para implantação e
// ativar, numa unit of work com auditoria e evento. Quem pode é a RLS que
// decide por último: só o Admin do grupo lê o staging e cria ou altera hotel;
// para os outros, o INSERT é recusado (42501) e o UPDATE não acha linha.
import type {
  HotelCadastrado,
  HotelDoStaging,
  SessaoDeHoteis,
  UsoDaLicenca,
} from '@hubkeep/aplicacao';
import { PermissaoNegada, ehModeloContratual } from '@hubkeep/dominio';
import { sql } from 'kysely';
import type { Tx } from '../conexao';
import { novoId } from '../ids';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

const COLUNAS_DO_HOTEL = [
  'id',
  'status',
  'nome',
  'fuso',
  'sistema_origem',
  'cod_externo',
  'modelo_contratual',
] as const;

const paraHotel = (h: {
  id: string;
  status: HotelCadastrado['status'];
  nome: string;
  fuso: string;
  sistema_origem: string | null;
  cod_externo: string | null;
  modelo_contratual: string | null;
}): HotelCadastrado => ({
  id: h.id,
  status: h.status,
  nome: h.nome,
  fuso: h.fuso,
  sistemaOrigem: h.sistema_origem,
  codExterno: h.cod_externo,
  modeloContratual: ehModeloContratual(h.modelo_contratual) ? h.modelo_contratual : null,
});

/**
 * Trava a licença do tenant até o fim da transação: ativação de hotel e
 * promoção de UHs leem o saldo e gravam em seguida, e duas ao mesmo tempo
 * leriam o mesmo saldo. É um advisory lock de transação (função do próprio
 * Postgres, sem função nova no projeto), solto no commit ou no rollback.
 */
export async function travarLicenca(uow: UnidadeDeTrabalho): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`hubkeep:licenca:${uow.tenantId}`}, 0))`.execute(
    transacaoDe(uow),
  );
}

/** Contrato e uso da licença no tenant do contexto (mesma métrica de licenca.uso()). */
export async function usoDaLicenca(tx: Tx): Promise<UsoDaLicenca> {
  const contrato = await tx
    .selectFrom('licenca.contrato')
    .select(['max_hoteis', 'max_uhs'])
    .executeTakeFirst();
  const hoteis = await tx
    .selectFrom('app.hotel')
    .select(sql<string>`count(*)`.as('n'))
    .where('status', '=', 'ativo')
    .executeTakeFirstOrThrow();
  const uhs = await tx
    .selectFrom('app.local')
    .select(sql<string>`count(*)`.as('n'))
    .where('tipo', '=', 'uh')
    .where('status', '=', 'ativo')
    .executeTakeFirstOrThrow();
  return {
    hoteis: { contratados: contrato?.max_hoteis ?? 0, emUso: Number(hoteis.n) },
    uhs: { contratadas: contrato?.max_uhs ?? 0, emUso: Number(uhs.n) },
  };
}

export async function hoteisDoStaging(tx: Tx): Promise<HotelDoStaging[]> {
  const linhas = await tx
    .selectFrom('staging.registro_externo')
    .select(['fonte', 'chave', 'payload', 'recebido_em'])
    .where('entidade', '=', 'hotel')
    .orderBy('fonte')
    .orderBy('chave')
    .execute();
  return linhas.map((l) => ({
    fonte: l.fonte,
    chave: l.chave,
    dados: (l.payload ?? {}) as Record<string, unknown>,
    recebidoEm: l.recebido_em,
  }));
}

export async function hoteisCadastrados(tx: Tx): Promise<HotelCadastrado[]> {
  return (await tx.selectFrom('app.hotel').select(COLUNAS_DO_HOTEL).orderBy('nome').execute()).map(
    paraHotel,
  );
}

export function sessaoDeHoteis(uow: UnidadeDeTrabalho): SessaoDeHoteis {
  const tx = transacaoDe(uow);
  return {
    usoDaLicenca: () => usoDaLicenca(tx),

    async hotel(id) {
      const h = await tx
        .selectFrom('app.hotel')
        .select(COLUNAS_DO_HOTEL)
        .where('id', '=', id)
        .executeTakeFirst();
      return h ? paraHotel(h) : null;
    },

    async hotelPorCodigo(fonte, chave) {
      const h = await tx
        .selectFrom('app.hotel')
        .select(COLUNAS_DO_HOTEL)
        .where('sistema_origem', '=', fonte)
        .where('cod_externo', '=', chave)
        .executeTakeFirst();
      return h ? paraHotel(h) : null;
    },

    async hotelDoStaging(fonte, chave) {
      const l = await tx
        .selectFrom('staging.registro_externo')
        .select(['fonte', 'chave', 'payload', 'recebido_em'])
        .where('entidade', '=', 'hotel')
        .where('fonte', '=', fonte)
        .where('chave', '=', chave)
        .executeTakeFirst();
      return l
        ? {
            fonte: l.fonte,
            chave: l.chave,
            dados: (l.payload ?? {}) as Record<string, unknown>,
            recebidoEm: l.recebido_em,
          }
        : null;
    },

    async criarHotel(h) {
      const id = novoId();
      await tx
        .insertInto('app.hotel')
        .values({
          id,
          tenant_id: uow.tenantId,
          nome: h.nome,
          fuso: h.fuso,
          status: 'em_implantacao',
          sistema_origem: h.fonte,
          cod_externo: h.chave,
        })
        .execute();
      uow.auditar({
        entidade: 'hotel',
        registroId: id,
        acao: 'importar_do_sistema_hoteleiro',
        hotelId: id,
        depois: { ...h, status: 'em_implantacao' },
      });
      uow.publicar({
        tipo: 'hotel.criado',
        entidade: 'hotel',
        registroId: id,
        payload: { hotelId: id, nome: h.nome, fonte: h.fonte, chave: h.chave },
      });
      return id;
    },

    async ativarHotel(id) {
      const antes = await tx
        .selectFrom('app.hotel')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirst();
      const r = await tx
        .updateTable('app.hotel')
        .set({ status: 'ativo', atualizado_em: sql`now()` })
        .where('id', '=', id)
        .executeTakeFirst();
      // A policy de UPDATE só deixa o Admin do grupo: para os outros, nenhuma linha.
      if (r.numUpdatedRows === 0n) {
        throw new PermissaoNegada('sem_permissao', 'A RLS não deixou ativar o hotel.');
      }
      uow.auditar({
        entidade: 'hotel',
        registroId: id,
        acao: 'ativar',
        hotelId: id,
        antes: { status: antes?.status ?? null },
        depois: { status: 'ativo' },
      });
      uow.publicar({
        tipo: 'hotel.ativado',
        entidade: 'hotel',
        registroId: id,
        payload: { hotelId: id },
      });
    },

    async uhsPendentes(hotelId) {
      return tx
        .selectFrom('app.local')
        .select('id')
        .where('hotel_id', '=', hotelId)
        .where('tipo', '=', 'uh')
        .where('status', '=', 'pendente_licenca')
        .orderBy('nome')
        .orderBy('id')
        .execute();
    },

    async liberarUh(hotelId, localId) {
      const r = await tx
        .updateTable('app.local')
        .set({ status: 'ativo', atualizado_em: sql`now()` })
        .where('id', '=', localId)
        .where('hotel_id', '=', hotelId)
        .where('status', '=', 'pendente_licenca')
        .executeTakeFirst();
      if (r.numUpdatedRows === 0n) return;
      uow.auditar({
        entidade: 'local',
        registroId: localId,
        acao: 'liberar_licenca',
        hotelId,
        antes: { status: 'pendente_licenca' },
        depois: { status: 'ativo' },
      });
    },

    async registrarAtivacaoBloqueada(hotelId, uso) {
      uow.auditar({
        entidade: 'hotel',
        registroId: hotelId,
        acao: 'ativacao_bloqueada_sem_saldo',
        hotelId,
        depois: uso,
      });
      // Sem manipulador ainda: fica no outbox até a notificação da 1c avisar a EasyGov.
      uow.publicar({
        tipo: 'licenca.sem_saldo',
        entidade: 'hotel',
        registroId: hotelId,
        payload: {
          hotelId,
          recurso: 'hoteis',
          contratados: uso.hoteis.contratados,
          emUso: uso.hoteis.emUso,
        },
      });
    },
  };
}
