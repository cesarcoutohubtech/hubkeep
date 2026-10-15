/**
 * Cliente Mews Connector API estritamente read-only para prova de conceito.
 * Isolado: não importa código HubKeep, não acessa Supabase, não grava dados.
 * Contratos oficiais: https://docs.mews.com/connector-api/operations
 */
const BASE_DEMO = 'https://api.mews-demo.com';
const OPERACOES = Object.freeze({
  enterprises: ['enterprises/getAll', 'Enterprises'],
  resources: ['resources/getAll', 'Resources'],
  resourceBlocks: ['resourceBlocks/getAll', 'ResourceBlocks'],
});

function intervaloRetryAfter(valor, agora) {
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000;
  const data = Date.parse(valor);
  return Number.isNaN(data) ? null : Math.max(0, data - agora());
}

export class ErroMews extends Error {
  constructor(codigo, status = null) {
    super(codigo);
    this.name = 'ErroMews';
    this.codigo = codigo;
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.clientToken Token DEMO, nunca enviado a logs.
 * @param {string} opts.accessToken Token DEMO, nunca enviado a logs.
 * @param {(url:string, init:object)=>Promise<Response>} [opts.fetchImpl]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 * @param {()=>number} [opts.now]
 */
export function criarClienteMews({
  clientToken,
  accessToken,
  clientName = 'HubKeep-EU-PoC/0.1',
  baseUrl = BASE_DEMO,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
  now = Date.now,
  pageSize = 100,
  maxPages = 50,
  maxRetries = 3,
  timeoutMs = 15000,
  minIntervalMs = 200,
} = {}) {
  if (![clientToken, accessToken, clientName].every((v) => typeof v === 'string' && v.trim())) {
    throw new ErroMews('credenciais_demo_obrigatorias');
  }
  // Bloqueio intencional de produção e de URL arbitrária na PoC.
  if (baseUrl !== BASE_DEMO) throw new ErroMews('somente_ambiente_demo');
  if (
    ![pageSize, maxPages, maxRetries, timeoutMs, minIntervalMs].every(Number.isInteger) ||
    pageSize < 1 ||
    pageSize > 1000 ||
    maxPages < 1 ||
    maxPages > 1000 ||
    maxRetries < 0 ||
    maxRetries > 6 ||
    timeoutMs < 100 ||
    minIntervalMs < 0
  ) {
    throw new ErroMews('configuracao_invalida');
  }
  let ultimaRequisicao = Number.NEGATIVE_INFINITY;

  async function requisitar(operacao, filtros) {
    const rota = OPERACOES[operacao]?.[0];
    if (!rota) throw new ErroMews('operacao_nao_permitida');
    const url = `${BASE_DEMO}/api/connector/v1/${rota}`;
    const corpo = JSON.stringify({
      ClientToken: clientToken,
      AccessToken: accessToken,
      Client: clientName,
      ...filtros,
    });
    for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
      const espera = Math.max(0, minIntervalMs - (now() - ultimaRequisicao));
      if (espera > 0) await sleep(espera);
      ultimaRequisicao = now();
      let resposta;
      try {
        resposta = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: corpo,
          signal: globalThis.AbortSignal.timeout(timeoutMs),
        });
      } catch {
        // O erro bruto do transportador poderia revelar corpo/tokens.
        if (tentativa === maxRetries) throw new ErroMews('rede_indisponivel');
        await sleep(Math.min(30000, 250 * 2 ** tentativa));
        continue;
      }
      if (resposta.status === 429 || resposta.status === 408 || resposta.status >= 500) {
        if (tentativa === maxRetries) throw new ErroMews('temporariamente_indisponivel', resposta.status);
        const retryAfter = intervaloRetryAfter(resposta.headers?.get?.('retry-after'), now);
        const atraso = retryAfter ?? Math.min(30000, 500 * 2 ** tentativa);
        if (atraso > 120000) throw new ErroMews('retry_after_excessivo', resposta.status);
        await sleep(atraso);
        continue;
      }
      if (!resposta.ok) throw new ErroMews('requisicao_recusada', resposta.status);
      try {
        const dados = await resposta.json();
        if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error();
        return dados;
      } catch {
        throw new ErroMews('resposta_invalida');
      }
    }
    throw new ErroMews('estado_impossivel');
  }

  async function listar(operacao, filtros = {}) {
    if (!OPERACOES[operacao]) throw new ErroMews('operacao_nao_permitida');
    if (filtros.Limitation || filtros.ClientToken || filtros.AccessToken || filtros.Client) {
      throw new ErroMews('filtros_reservados');
    }
    const campo = OPERACOES[operacao][1];
    const itens = [];
    const vistos = new Set();
    let cursor = null;
    for (let pagina = 0; pagina < maxPages; pagina++) {
      const limitation = { Count: pageSize, ...(cursor ? { Cursor: cursor } : {}) };
      const resposta = await requisitar(operacao, { ...filtros, Limitation: limitation });
      const lote = resposta[campo];
      if (!Array.isArray(lote)) throw new ErroMews('lista_ausente');
      itens.push(...lote);
      const proximo = resposta.Cursor;
      if (lote.length < pageSize || !proximo) return itens;
      if (typeof proximo !== 'string' || vistos.has(proximo)) throw new ErroMews('cursor_repetido');
      vistos.add(proximo);
      cursor = proximo;
    }
    throw new ErroMews('limite_paginas_excedido');
  }

  /**
   * Consulta UMA página de demonstração, sem iterar por todos os hotéis.
   * Permite teste de fumaça com no máximo três chamadas HTTP totais.
   */
  async function lerPagina(operacao, filtros = {}) {
    if (!OPERACOES[operacao]) throw new ErroMews('operacao_nao_permitida');
    if (filtros.Limitation || filtros.ClientToken || filtros.AccessToken || filtros.Client) {
      throw new ErroMews('filtros_reservados');
    }
    const response = await requisitar(operacao, { ...filtros, Limitation: { Count: pageSize } });
    const items = response[OPERACOES[operacao][1]];
    if (!Array.isArray(items)) throw new ErroMews('lista_ausente');
    return { itens: items, cursor: typeof response.Cursor === 'string' ? response.Cursor : null };
  }

  return Object.freeze({
    lerPrimeiraPaginaDeEmpresas: (filtros = {}) => lerPagina('enterprises', filtros),
    lerPrimeiraPaginaDeRecursos: (enterpriseIds) => {
      if (!Array.isArray(enterpriseIds) || !enterpriseIds.length || !enterpriseIds.every(Boolean)) {
        throw new ErroMews('enterprise_ids_obrigatorios');
      }
      return lerPagina('resources', { EnterpriseIds: enterpriseIds,
        Extent: { Resources: true, Inactive: true } });
    },
    lerPrimeiraPaginaDeBloqueios: (enterpriseIds) => {
      if (!Array.isArray(enterpriseIds) || !enterpriseIds.length || !enterpriseIds.every(Boolean)) {
        throw new ErroMews('enterprise_ids_obrigatorios');
      }
      return lerPagina('resourceBlocks', { EnterpriseIds: enterpriseIds,
        ActivityStates: ['Active', 'Deleted'] });
    },
    listarEmpresas: (filtros = {}) => listar('enterprises', filtros),
    listarRecursos: (enterpriseIds, filtros = {}) => {
      if (!Array.isArray(enterpriseIds) || !enterpriseIds.length || !enterpriseIds.every(Boolean)) {
        throw new ErroMews('enterprise_ids_obrigatorios');
      }
      return listar('resources', {
        ...filtros,
        EnterpriseIds: enterpriseIds,
        Extent: { Resources: true, Inactive: true },
      });
    },
    listarBloqueios: (enterpriseIds, filtros = {}) => {
      if (!Array.isArray(enterpriseIds) || !enterpriseIds.length || !enterpriseIds.every(Boolean)) {
        throw new ErroMews('enterprise_ids_obrigatorios');
      }
      return listar('resourceBlocks', {
        ...filtros,
        EnterpriseIds: enterpriseIds,
        ActivityStates: ['Active', 'Deleted'],
      });
    },
  });
}
