/**
 * Orquestrador de sincronização Mews Demo, somente leitura.
 * Os checkpoints e registros são mantidos EXCLUSIVAMENTE em memória.
 * Sem bancos, filesystem, webhooks, OS ou mudanças de room status.
 */
import { criarEscopo, montarProjecao } from './normalizacao.mjs';

const DIA_MS = 86400000;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PROPRIEDADES_RECURSO = ['Id', 'EnterpriseId', 'Name', 'State', 'IsActive', 'DeletedUtc', 'UpdatedUtc'];
const PROPRIEDADES_BLOCO = [
  'Id', 'EnterpriseId', 'AssignedResourceId', 'Type', 'StartUtc',
  'EndUtc', 'IsActive', 'DeletedUtc', 'UpdatedUtc',
];

function exigirUtc(data) {
  const ms = typeof data === 'string' && UTC.test(data) ? Date.parse(data) : NaN;
  if (!Number.isFinite(ms)) throw new Error('instante_utc_invalido');
  return ms;
}
function utc(ms) { return new Date(ms).toISOString().replace('.000Z', 'Z'); }
function filtrar(obj, campos) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('registro_invalido');
  const saida = {};
  for (const chave of campos) if (Object.hasOwn(obj, chave)) saida[chave] = obj[chave];
  return saida;
}
function recursoSeguro(r, enterpriseId) {
  if (r?.EnterpriseId !== enterpriseId || typeof r?.Id !== 'string' || !r.Id.trim()) {
    throw new Error('recurso_fora_do_escopo');
  }
  const s = filtrar(r, PROPRIEDADES_RECURSO);
  s.Data = {
    Discriminator: r.Data?.Discriminator,
    Value: { FloorNumber: r.Data?.Value?.FloorNumber },
  };
  return s;
}
function blocoSeguro(b, enterpriseId) {
  if (b?.EnterpriseId !== enterpriseId || typeof b?.Id !== 'string' || !b.Id.trim()) {
    throw new Error('bloqueio_fora_do_escopo');
  }
  exigirUtc(b.UpdatedUtc);
  return filtrar(b, PROPRIEDADES_BLOCO);
}

/**
 * Recebe um cliente somente leitura da PoC, com listarRecursos/listarBloqueios.
 * Somente vínculos humano-validados (tenant/hotel/enterprise) podem ser consultados.
 * @param {{cliente:object,tenantId:string,vinculos:Array<{hotelId:string,enterpriseId:string}>,sobreposicaoMinutos?:number}} opts
 */
export function criarSincronizadorPreview({ cliente, tenantId, vinculos, sobreposicaoMinutos = 5 }) {
  if (!cliente || typeof cliente.listarRecursos !== 'function' ||
      typeof cliente.listarBloqueios !== 'function') throw new Error('cliente_invalido');
  if (!Number.isInteger(sobreposicaoMinutos) || sobreposicaoMinutos < 0 ||
      sobreposicaoMinutos > 60) throw new Error('sobreposicao_invalida');
  const escopo = criarEscopo({ tenantId, vinculos });
  const hoteis = new Map();
  for (const v of vinculos) {
    if (hoteis.has(v.hotelId)) throw new Error('hotel_duplicado');
    hoteis.set(v.hotelId, v.enterpriseId);
  }
  const estados = new Map(); // não exportar snapshots mutáveis
  const emExecucao = new Set();

  async function executar({ tenantId: solicitante, hotelId, enterpriseId, ateUtc }) {
    if (solicitante !== tenantId || !hoteis.has(hotelId) ||
        hoteis.get(hotelId) !== enterpriseId) throw new Error('escopo_nao_autorizado');
    if (emExecucao.has(hotelId)) throw new Error('sincronizacao_concorrente');
    const ate = exigirUtc(ateUtc);
    const anterior = estados.get(hotelId);
    if (anterior && ate <= anterior.ateMs) throw new Error('checkpoint_nao_avanca');
    const desde = anterior ? anterior.ateMs - sobreposicaoMinutos * 60000 : ate;
    if (anterior && ate - desde > 30 * DIA_MS) throw new Error('intervalo_longo_exige_fatiamento');
    const filtro = anterior
      ? { UpdatedUtc: { StartUtc: utc(desde), EndUtc: utc(ate) } }
      : { CollidingUtc: { StartUtc: utc(desde), EndUtc: utc(ate + 30 * DIA_MS) } };

    emExecucao.add(hotelId);
    try {
      // O cliente percorre TODAS as páginas e interrompe por erro/cursor repetido.
      // Nenhum checkpoint é avançado antes de ambas as listagens finalizarem.
      const recursos = await cliente.listarRecursos([enterpriseId]);
      const alterados = await cliente.listarBloqueios([enterpriseId], filtro);
      if (!Array.isArray(recursos) || !Array.isArray(alterados)) {
        throw new Error('lista_invalida');
      }
      const espacos = recursos.map(r => recursoSeguro(r, enterpriseId));
      const blocos = new Map(anterior?.blocos || []);
      for (const cru of alterados) {
        const atual = blocoSeguro(cru, enterpriseId);
        const chave = atual.Id;
        const previo = blocos.get(chave);
        if (!previo || exigirUtc(atual.UpdatedUtc) >= exigirUtc(previo.UpdatedUtc)) {
          // Inclui exclusões (tombstones); nunca apaga porque uma página as omitiu.
          blocos.set(chave, atual);
        }
      }
      const projecao = montarProjecao(escopo, espacos, [...blocos.values()]);
      const saida = Object.freeze({
        tenantId, hotelId, enterpriseId,
        checkpointUtc: utc(ate), filtro: Object.freeze(filtro),
        recursosLidos: recursos.length, bloqueiosNestaRodada: alterados.length,
        espacos: Object.freeze(projecao.espacos.filter(x => x.hotelId === hotelId)),
        bloqueios: Object.freeze(projecao.bloqueios.filter(x => x.hotelId === hotelId)),
        gravouNoHubKeep: false, gerouOs: false,
      });
      estados.set(hotelId, { ateMs: ate, blocos });
      return saida;
    } finally {
      emExecucao.delete(hotelId);
    }
  }
  function checkpoint({ tenantId: solicitante, hotelId }) {
    if (solicitante !== tenantId || !hoteis.has(hotelId)) throw new Error('escopo_nao_autorizado');
    const state = estados.get(hotelId);
    return state ? utc(state.ateMs) : null;
  }
  return Object.freeze({ executar, checkpoint });
}
