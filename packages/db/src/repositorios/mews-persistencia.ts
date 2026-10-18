// HubKeep Europa / Mews V1 — persistência técnica sem job, rota ou credencial.
// Apenas hk_worker via executarComoSistema (UoW, RLS e transação).
// Não cria OS, não atualiza UHs, não chama a Mews nem abre acesso ao público.
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { AcessoBanco } from '../acesso';
import { validarUuid } from '../conexao';
import { transacaoDe, type UnidadeDeTrabalho } from '../unidade-de-trabalho';

type Modo = 'incremental' | 'reconciliacao';
type Escopo = { tenantId: string; hotelId: string; enterpriseId: string };
type ComEscopo = Escopo;
export type EspacoMews = ComEscopo & {
  resourceId: string;
  codigoExterno: string;
  ativoNoPms: boolean;
  atualizadoEm: string | null;
};
export type BloqueioMews = ComEscopo & {
  codigoExterno: string;
  codigoRecurso: string;
  tipoBloqueio: 'OutOfOrder' | 'InternalUse';
  inicio: string;
  fim: string;
  ativoNoPms: boolean;
  atualizadoEm: string;
};

/** Formato do contrato offline prepararLote; NÃO receber diretamente de uma rota HTTP. */
export interface LoteMews extends Escopo {
  key: string;
  modo: Modo;
  versaoEsperada: number;
  checkpointEsperado: string | null;
  novoCheckpoint: string;
  digest: string;
  espacos: readonly EspacoMews[];
  bloqueios: readonly BloqueioMews[];
}
export type ResultadoPersistenciaMews =
  | { resultado: 'aplicado'; versao: string; checkpointUtc: string }
  | { resultado: 'replay_idempotente'; versao: string; checkpointUtc: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DIGEST = /^[0-9a-f]{64}$/;
const LIMITE_ITENS = 10_000;

function texto(valor: unknown, max = 200): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= max;
}
function dataUtc(valor: string): Date {
  const data = typeof valor === 'string' && ISO.test(valor) ? new Date(valor) : null;
  if (!data || !Number.isFinite(data.getTime())) throw new Error('mews_utc_invalido');
  return data;
}
function iso(data: Date | null): string | null {
  return data ? data.toISOString() : null;
}
function escopoIgual(item: Escopo, lote: Escopo): boolean {
  return (
    item.tenantId === lote.tenantId &&
    item.hotelId === lote.hotelId &&
    item.enterpriseId === lote.enterpriseId
  );
}

/** Validação de confiança e digest CANÔNICO antes de abrir conexão. */
export function conferirLoteMews(lote: LoteMews): LoteMews {
  if (!lote || typeof lote !== 'object') throw new Error('mews_lote_invalido');
  validarUuid(lote.tenantId, 'tenantId');
  validarUuid(lote.hotelId, 'hotelId');
  if (!texto(lote.enterpriseId) || !['incremental', 'reconciliacao'].includes(lote.modo)) {
    throw new Error('mews_escopo_invalido');
  }
  const key = JSON.stringify([lote.tenantId, lote.hotelId, lote.enterpriseId]);
  if (
    lote.key !== key ||
    !Number.isSafeInteger(lote.versaoEsperada) ||
    lote.versaoEsperada < 0 ||
    !DIGEST.test(lote.digest)
  ) {
    throw new Error('mews_plano_invalido');
  }
  dataUtc(lote.novoCheckpoint);
  if (lote.checkpointEsperado !== null) dataUtc(lote.checkpointEsperado);
  if (
    !Array.isArray(lote.espacos) ||
    !Array.isArray(lote.bloqueios) ||
    lote.espacos.length + lote.bloqueios.length > LIMITE_ITENS
  ) {
    throw new Error('mews_lote_excessivo');
  }
  const recursos = new Set<string>();
  const idsRecurso = new Set<string>();
  const espacos = lote.espacos
    .map((r) => {
      if (
        !escopoIgual(r, lote) ||
        !texto(r.resourceId) ||
        r.codigoExterno !== lote.enterpriseId + '|' + r.resourceId ||
        !texto(r.codigoExterno) ||
        typeof r.ativoNoPms !== 'boolean' ||
        (r.atualizadoEm !== null && typeof r.atualizadoEm !== 'string')
      ) {
        throw new Error('mews_recurso_invalido');
      }
      if (r.atualizadoEm !== null) dataUtc(r.atualizadoEm);
      if (!r.ativoNoPms && r.atualizadoEm === null) throw new Error('mews_tombstone_sem_data');
      if (recursos.has(r.codigoExterno)) throw new Error('mews_recurso_duplicado');
      recursos.add(r.codigoExterno);
      idsRecurso.add(r.resourceId);
      return {
        resourceId: r.resourceId,
        codigoExterno: r.codigoExterno,
        ativoNoPms: r.ativoNoPms,
        atualizadoEm: r.atualizadoEm,
      };
    })
    .sort((a, b) => a.codigoExterno.localeCompare(b.codigoExterno));
  const idsBloqueio = new Set<string>();
  const bloqueios = lote.bloqueios
    .map((b) => {
      const prefixo = lote.enterpriseId + '|';
      const id =
        typeof b.codigoExterno === 'string' && b.codigoExterno.startsWith(prefixo)
          ? b.codigoExterno.slice(prefixo.length)
          : '';
      if (
        !escopoIgual(b, lote) ||
        !texto(id) ||
        !texto(b.codigoExterno) ||
        !texto(b.codigoRecurso) ||
        !b.codigoRecurso.startsWith(prefixo) ||
        !idsRecurso.has(b.codigoRecurso.slice(prefixo.length)) ||
        !['OutOfOrder', 'InternalUse'].includes(b.tipoBloqueio) ||
        typeof b.ativoNoPms !== 'boolean' ||
        dataUtc(b.fim).getTime() <= dataUtc(b.inicio).getTime()
      ) {
        throw new Error('mews_bloqueio_invalido');
      }
      dataUtc(b.atualizadoEm);
      if (idsBloqueio.has(b.codigoExterno)) throw new Error('mews_bloqueio_duplicado');
      idsBloqueio.add(b.codigoExterno);
      if (
        b.ativoNoPms &&
        !espacos.some((r) => r.codigoExterno === b.codigoRecurso && r.ativoNoPms)
      ) {
        throw new Error('mews_bloqueio_recurso_inativo');
      }
      return {
        codigoExterno: b.codigoExterno,
        codigoRecurso: b.codigoRecurso,
        tipoBloqueio: b.tipoBloqueio,
        inicio: b.inicio,
        fim: b.fim,
        ativoNoPms: b.ativoNoPms,
        atualizadoEm: b.atualizadoEm,
      };
    })
    .sort((a, b) => a.codigoExterno.localeCompare(b.codigoExterno));
  const assinatura = JSON.stringify([
    key,
    lote.modo,
    lote.checkpointEsperado,
    lote.novoCheckpoint,
    espacos,
    bloqueios,
  ]);
  if (createHash('sha256').update(assinatura).digest('hex') !== lote.digest) {
    throw new Error('mews_digest_invalido');
  }
  // Apenas campos sanitizados; nunca encaminhar Notes ou payload bruto.
  return {
    ...lote,
    espacos: espacos.map((r) => ({ ...loteEscopo(lote), ...r })),
    bloqueios: bloqueios.map((b) => ({ ...loteEscopo(lote), ...b })),
  };
}
function loteEscopo(lote: Escopo): Escopo {
  return { tenantId: lote.tenantId, hotelId: lote.hotelId, enterpriseId: lote.enterpriseId };
}
function dataOpcional(valor: string | null): Date | null {
  return valor === null ? null : dataUtc(valor);
}

/**
 * Transação do mesmo UoW usada pelo restante do produto: bloqueia PRIMEIRO
 * vínculo (inclusive no bootstrap), bloqueia checkpoint, compara versão/digest,
 * persiste projeção e checkpoint atomicamente. Revogação também disputa o lock.
 */
async function persistirNaUnidade(
  uow: UnidadeDeTrabalho,
  lote: LoteMews,
): Promise<ResultadoPersistenciaMews> {
  const tx = transacaoDe(uow);
  const filtro = {
    tenant_id: lote.tenantId,
    hotel_id: lote.hotelId,
    enterprise_id: lote.enterpriseId,
  };
  const vinculo = await tx
    .selectFrom('app.mews_vinculo')
    .select(['id', 'revogado_em'])
    .where('tenant_id', '=', filtro.tenant_id)
    .where('hotel_id', '=', filtro.hotel_id)
    .where('enterprise_id', '=', filtro.enterprise_id)
    .forUpdate()
    .executeTakeFirst();
  if (!vinculo || vinculo.revogado_em !== null) throw new Error('mews_vinculo_invalido');

  const ck = await tx
    .selectFrom('app.mews_checkpoint')
    .selectAll()
    .where('tenant_id', '=', filtro.tenant_id)
    .where('hotel_id', '=', filtro.hotel_id)
    .where('enterprise_id', '=', filtro.enterprise_id)
    .forUpdate()
    .executeTakeFirst();
  const versao = ck ? BigInt(ck.versao) : 0n;
  const incremental = lote.modo === 'incremental';
  const marco = incremental ? (ck?.ultimo_updated_utc ?? null) : (ck?.ultimo_sweep_utc ?? null);
  const digestAtual = incremental ? ck?.digest_incremental : ck?.digest_sweep;
  if (iso(marco) === iso(dataUtc(lote.novoCheckpoint)) && digestAtual === lote.digest) {
    return {
      resultado: 'replay_idempotente',
      versao: versao.toString(),
      checkpointUtc: lote.novoCheckpoint,
    };
  }
  if (
    versao !== BigInt(lote.versaoEsperada) ||
    iso(marco) !== (lote.checkpointEsperado === null ? null : iso(dataUtc(lote.checkpointEsperado)))
  ) {
    throw new Error('mews_conflito_checkpoint_cas');
  }
  if (!incremental && !ck?.ultimo_updated_utc) throw new Error('mews_bootstrap_necessario');
  if (marco && dataUtc(lote.novoCheckpoint) <= marco) {
    throw new Error('mews_checkpoint_nao_avanca');
  }

  // Proteção contra reordenamento: registros mais antigos não sobrescrevem
  // tombstones; no empate, tombstone vence evento ativo.
  for (const r of lote.espacos) {
    const tempo = dataOpcional(r.atualizadoEm);
    await tx
      .insertInto('app.mews_recurso')
      .values({
        ...filtro,
        resource_id: r.resourceId,
        tipo: 'Space',
        ativo: r.ativoNoPms,
        updated_utc: tempo,
        deleted_utc: r.ativoNoPms ? null : tempo,
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'hotel_id', 'enterprise_id', 'resource_id']).doUpdateSet({
          ativo: sql<boolean>`excluded.ativo`,
          updated_utc: sql<Date | null>`excluded.updated_utc`,
          deleted_utc: sql<Date | null>`excluded.deleted_utc`,
        }).where(sql<boolean>`
      (app.mews_recurso.updated_utc is null and excluded.updated_utc is not null)
      or excluded.updated_utc > app.mews_recurso.updated_utc
      or (excluded.updated_utc = app.mews_recurso.updated_utc
          and excluded.ativo = false and app.mews_recurso.ativo = true)
    `),
      )
      .execute();
  }
  for (const b of lote.bloqueios) {
    const blockId = b.codigoExterno.slice(lote.enterpriseId.length + 1);
    const resourceId = b.codigoRecurso.slice(lote.enterpriseId.length + 1);
    const updated = dataUtc(b.atualizadoEm);
    await tx
      .insertInto('app.mews_bloqueio')
      .values({
        ...filtro,
        block_id: blockId,
        resource_id: resourceId,
        tipo: b.tipoBloqueio,
        inicio_utc: dataUtc(b.inicio),
        fim_utc: dataUtc(b.fim),
        ativo: b.ativoNoPms,
        updated_utc: updated,
        deleted_utc: b.ativoNoPms ? null : updated,
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'hotel_id', 'enterprise_id', 'block_id']).doUpdateSet({
          resource_id: sql<string>`excluded.resource_id`,
          tipo: sql<string>`excluded.tipo`,
          inicio_utc: sql<Date>`excluded.inicio_utc`,
          fim_utc: sql<Date>`excluded.fim_utc`,
          ativo: sql<boolean>`excluded.ativo`,
          updated_utc: sql<Date>`excluded.updated_utc`,
          deleted_utc: sql<Date | null>`excluded.deleted_utc`,
        }).where(sql<boolean>`
      excluded.updated_utc > app.mews_bloqueio.updated_utc
      or (excluded.updated_utc = app.mews_bloqueio.updated_utc
          and excluded.ativo = false and app.mews_bloqueio.ativo = true)
    `),
      )
      .execute();
  }

  const seguinte = (versao + 1n).toString();
  const agora = new Date();
  if (ck) {
    const atualizacao = incremental
      ? { ultimo_updated_utc: dataUtc(lote.novoCheckpoint), digest_incremental: lote.digest }
      : { ultimo_sweep_utc: dataUtc(lote.novoCheckpoint), digest_sweep: lote.digest };
    const atualizado = await tx
      .updateTable('app.mews_checkpoint')
      .set({
        ...atualizacao,
        versao: seguinte,
        concluido_em: agora,
      })
      .where('tenant_id', '=', filtro.tenant_id)
      .where('hotel_id', '=', filtro.hotel_id)
      .where('enterprise_id', '=', filtro.enterprise_id)
      .where('versao', '=', versao.toString())
      .returning('versao')
      .executeTakeFirst();
    if (!atualizado) throw new Error('mews_conflito_checkpoint_cas');
  } else {
    await tx
      .insertInto('app.mews_checkpoint')
      .values({
        ...filtro,
        versao: seguinte,
        concluido_em: agora,
        ultimo_updated_utc: dataUtc(lote.novoCheckpoint),
        ultimo_sweep_utc: null,
        digest_incremental: lote.digest,
        digest_sweep: null,
      })
      .execute();
  }
  uow.auditar({
    entidade: 'mews_checkpoint',
    registroId: vinculo.id,
    hotelId: lote.hotelId,
    acao: 'mews_projecao_tecnica',
    antes: { versao: versao.toString(), modo: lote.modo },
    depois: {
      versao: seguinte,
      modo: lote.modo,
      recursos: lote.espacos.length,
      bloqueios: lote.bloqueios.length,
    },
  });
  return { resultado: 'aplicado', versao: seguinte, checkpointUtc: lote.novoCheckpoint };
}

/**
 * Adapter ainda não ligado à composição, cron nem API. Sempre gera UoW no
 * papel hk_worker, com tenant fixado antes da primeira query (RLS FORCE).
 */
export function criarPersistenciaMews(banco: Pick<AcessoBanco, 'executarComoSistema'>) {
  return {
    aplicar: async (plano: LoteMews): Promise<ResultadoPersistenciaMews> => {
      const lote = conferirLoteMews(plano);
      return banco.executarComoSistema({ tenantId: lote.tenantId }, (uow) =>
        persistirNaUnidade(uow, lote),
      );
    },
  };
}
