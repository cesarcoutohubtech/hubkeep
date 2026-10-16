/**
 * CONTRATO de lote/checkpoint para futura persistência Mews; ainda NÃO é um driver SQL.
 * Nenhum banco, rede, disco ou webhook. O repositório em memória simula CAS
 * transacional para exercitar concorrência, replays e falhas sem efeitos reais.
 */
import { createHash } from 'node:crypto';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CAMPOS_ESPACO = ['resourceId', 'codigoExterno', 'ativoNoPms', 'atualizadoEm'];
const CAMPOS_BLOQUEIO = [
  'codigoExterno', 'codigoRecurso', 'tipoBloqueio', 'inicio', 'fim',
  'ativoNoPms', 'atualizadoEm',
];
const str = (s) => typeof s === 'string' && s.trim() && s.length <= 200 ? s : null;
function instante(s) {
  const ms = typeof s === 'string' && ISO_UTC.test(s) ? Date.parse(s) : NaN;
  if (!Number.isFinite(ms)) throw new Error('checkpoint_utc_invalido');
  return ms;
}
function identidade({ tenantId, hotelId, enterpriseId }) {
  if (!str(tenantId) || !str(hotelId) || !str(enterpriseId)) {
    throw new Error('escopo_invalido');
  }
  // A serialização estruturada evita colisão causada por delimitadores em IDs.
  return JSON.stringify([tenantId, hotelId, enterpriseId]);
}
function seguro(item, campos, escopo, tipo) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('item_invalido');
  for (const chave of ['tenantId', 'hotelId', 'enterpriseId']) {
    if (item[chave] !== escopo[chave]) throw new Error('item_fora_do_escopo');
  }
  const s = {};
  for (const chave of campos) if (Object.hasOwn(item, chave)) s[chave] = item[chave];
  if (!str(s.codigoExterno) || !s.codigoExterno.startsWith(`${escopo.enterpriseId}|`)) {
    throw new Error('chave_externa_invalida');
  }
  if (typeof s.ativoNoPms !== 'boolean') throw new Error('estado_invalido');
  if (tipo === 'espaco') {
    if (!str(s.resourceId) || s.codigoExterno !== `${escopo.enterpriseId}|${s.resourceId}`) {
      throw new Error('recurso_invalido');
    }
  } else {
    if (!str(s.codigoRecurso) || !s.codigoRecurso.startsWith(`${escopo.enterpriseId}|`)) {
      throw new Error('recurso_fora_do_escopo');
    }
    if (!['OutOfOrder', 'InternalUse'].includes(s.tipoBloqueio)) {
      throw new Error('tipo_bloqueio_invalido');
    }
    instante(s.inicio);
    instante(s.fim);
    if (instante(s.fim) <= instante(s.inicio)) throw new Error('intervalo_bloqueio_invalido');
    instante(s.atualizadoEm);
  }
  if (s.atualizadoEm !== null && s.atualizadoEm !== undefined) instante(s.atualizadoEm);
  return s; // allowlist: Notes, contatos e hóspedes não atravessam.
}
function listaSegura(items, campos, escopo, tipo) {
  if (!Array.isArray(items) || items.length > 100000) throw new Error('lista_invalida');
  const mapa = new Map();
  for (const item of items) {
    const s = seguro(item, campos, escopo, tipo);
    if (mapa.has(s.codigoExterno)) throw new Error('item_duplicado');
    mapa.set(s.codigoExterno, s);
  }
  return [...mapa.values()].sort((a, b) => a.codigoExterno.localeCompare(b.codigoExterno));
}

/**
 * Proposta imutável para atualização de um hotel; não a executa.
 * Checkpoint esperado null somente no primeiro commit.
 */
export function prepararLote({ tenantId, hotelId, enterpriseId, checkpointEsperado = null,
  novoCheckpoint, espacos, bloqueios }) {
  const escopo = { tenantId, hotelId, enterpriseId };
  const key = identidade(escopo);
  const proximoMs = instante(novoCheckpoint);
  if (checkpointEsperado !== null && proximoMs <= instante(checkpointEsperado)) {
    throw new Error('checkpoint_nao_avanca');
  }
  const safeEspacos = listaSegura(espacos, CAMPOS_ESPACO, escopo, 'espaco');
  const safeBloqueios = listaSegura(bloqueios, CAMPOS_BLOQUEIO, escopo, 'bloqueio');
  const recursosAutorizados = new Set(safeEspacos.map(x => x.codigoExterno));
  if (safeBloqueios.some(b => !recursosAutorizados.has(b.codigoRecurso))) {
    throw new Error('bloqueio_sem_recurso_do_hotel');
  }
  // Não confundir ausência na consulta incremental com exclusão.
  const assinatura = JSON.stringify([key, checkpointEsperado, novoCheckpoint, safeEspacos, safeBloqueios]);
  return Object.freeze({
    key, ...escopo, checkpointEsperado, novoCheckpoint,
    digest: createHash('sha256').update(assinatura).digest('hex'),
    espacos: Object.freeze(safeEspacos.map(x => Object.freeze(x))),
    bloqueios: Object.freeze(safeBloqueios.map(x => Object.freeze(x))),
    persistiu: false,
  });
}

/**
 * FAKE de armazenamento transacional para teste; não é durável.
 * Um futuro driver PostgreSQL precisa implementar o mesmo CAS sob transação
 * + RLS e publicar itens/checkpoint juntos, com rollback na falha.
 */
export function criarRepositorioSimulado() {
  const estados = new Map();
  function aplicar(plano, { falharAntesCommit = false } = {}) {
    if (!plano || plano.persistiu !== false || !str(plano.tenantId)) {
      throw new Error('plano_invalido');
    }
    const key = identidade(plano);
    if (key !== plano.key) throw new Error('plano_fora_do_escopo');
    const anterior = estados.get(key);
    if (anterior?.checkpointUtc === plano.novoCheckpoint && anterior.digest === plano.digest) {
      return Object.freeze({ resultado: 'replay_idempotente', checkpointUtc: anterior.checkpointUtc });
    }
    if ((anterior?.checkpointUtc ?? null) !== plano.checkpointEsperado) {
      throw new Error('conflito_checkpoint_cas');
    }
    if (falharAntesCommit) throw new Error('falha_simulada_sem_commit');
    // Construir a nova projeção fora da publicação para evitar estados parciais.
    const recursos = new Map(anterior?.recursos ?? []);
    const bloqueios = new Map(anterior?.bloqueios ?? []);
    for (const item of plano.espacos) {
      const anteriorItem = recursos.get(item.codigoExterno);
      if (!anteriorItem?.atualizadoEm || !item.atualizadoEm ||
          instante(item.atualizadoEm) >= instante(anteriorItem.atualizadoEm)) {
        recursos.set(item.codigoExterno, structuredClone(item));
      }
    }
    for (const item of plano.bloqueios) {
      const anteriorItem = bloqueios.get(item.codigoExterno);
      // Tombstone mais novo nunca é ressuscitado por evento fora de ordem.
      if (!anteriorItem || instante(item.atualizadoEm) >= instante(anteriorItem.atualizadoEm)) {
        bloqueios.set(item.codigoExterno, structuredClone(item));
      }
    }
    estados.set(key, { checkpointUtc: plano.novoCheckpoint, digest: plano.digest,
      recursos, bloqueios });
    return Object.freeze({ resultado: 'aplicado', checkpointUtc: plano.novoCheckpoint });
  }
  function consultar({ tenantId, hotelId, enterpriseId }) {
    const key = identidade({ tenantId, hotelId, enterpriseId });
    const s = estados.get(key);
    return s ? structuredClone({
      checkpointUtc: s.checkpointUtc,
      espacos: [...s.recursos.values()],
      bloqueios: [...s.bloqueios.values()],
    }) : null;
  }
  return Object.freeze({ aplicar, consultar });
}
