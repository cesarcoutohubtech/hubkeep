/**
 * Laboratorio offline: porta de armazenamento e reconciliacao Mews.
 * NAO conecta Mews, Supabase ou HubKeep. Nao usar em producao.
 * O adaptador simula transacoes atomicas com compare-and-swap por hotel.
 */
const MS_DIA = 86400000;
function dataUtc(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) || !Number.isFinite(Date.parse(s)))
    throw new Error('utc_invalido');
  return Date.parse(s);
}
function copia(v) { return JSON.parse(JSON.stringify(v)); }
function chave({ tenantId, hotelId, enterpriseId }) {
  if (![tenantId, hotelId, enterpriseId].every(x => typeof x === 'string' && x.trim().length > 0))
    throw new Error('escopo_invalido');
  return JSON.stringify([tenantId, hotelId, enterpriseId]);
}
export function criarArmazenamentoSimulado() {
  const estados = new Map();
  return Object.freeze({
    ler(escopo) {
      const e = estados.get(chave(escopo));
      return e ? copia(e) : { revisao: 0, checkpointUtc: null, checkpointVarreduraUtc: null, bloqueios: [] };
    },
    confirmar(escopo, revisaoEsperada, novo) {
      const k = chave(escopo);
      const atual = estados.get(k) ?? { revisao: 0, checkpointUtc: null, checkpointVarreduraUtc: null, bloqueios: [] };
      if (atual.revisao !== revisaoEsperada) throw new Error('conflito_de_revisao');
      if (!novo || !Array.isArray(novo.bloqueios)) throw new Error('snapshot_invalido');
      const modo = novo.modo ?? 'incremental';
      if (!['incremental', 'reconciliacao'].includes(modo)) throw new Error('modo_invalido');
      const proximoMs = dataUtc(novo.checkpointUtc);
      const marcoIncremental = atual.checkpointUtc ? dataUtc(atual.checkpointUtc) : null;
      let checkpointUtc = atual.checkpointUtc;
      let checkpointVarreduraUtc = atual.checkpointVarreduraUtc;
      if (modo === 'incremental') {
        if (marcoIncremental !== null && proximoMs <= marcoIncremental)
          throw new Error('checkpoint_regressivo');
        checkpointUtc = novo.checkpointUtc;
        // O bootstrap e CollidingUtc, logo tambem constitui uma primeira varredura.
        if (marcoIncremental === null) checkpointVarreduraUtc = novo.checkpointUtc;
      } else {
        if (marcoIncremental === null) throw new Error('bootstrap_necessario');
        if (atual.checkpointVarreduraUtc &&
            proximoMs <= dataUtc(atual.checkpointVarreduraUtc)) throw new Error('varredura_regressiva');
        checkpointVarreduraUtc = novo.checkpointUtc;
      }
      const ids = new Set();
      for (const b of novo.bloqueios) {
        if (!b || typeof b.Id !== 'string' || !b.Id || ids.has(b.Id) ||
            b.EnterpriseId !== escopo.enterpriseId) throw new Error('bloqueio_invalido');
        dataUtc(b.UpdatedUtc);
        ids.add(b.Id);
      }
      const commit = copia({ revisao: atual.revisao + 1, checkpointUtc, checkpointVarreduraUtc, bloqueios: novo.bloqueios });
      estados.set(k, commit); // unico ponto de publicacao
      return copia(commit);
    },
  });
}
export function criarReconciliadorLaboratorio({ armazenamento, tenantId, vinculos, horizonteDias = 30, sobreposicaoMinutos = 5 }) {
  if (!armazenamento || typeof armazenamento.ler !== 'function' || typeof armazenamento.confirmar !== 'function')
    throw new Error('armazenamento_invalido');
  if (!Array.isArray(vinculos) || !vinculos.length || !Number.isInteger(horizonteDias) ||
      horizonteDias < 1 || horizonteDias > 30 || !Number.isInteger(sobreposicaoMinutos) ||
      sobreposicaoMinutos < 0 || sobreposicaoMinutos > 60) throw new Error('configuracao_invalida');
  const mapa = new Map();
  for (const v of vinculos) {
    if (typeof v.hotelId !== 'string' || !v.hotelId || typeof v.enterpriseId !== 'string' || !v.enterpriseId ||
        mapa.has(v.hotelId) || [...mapa.values()].includes(v.enterpriseId))
      throw new Error('vinculo_invalido');
    mapa.set(v.hotelId, v.enterpriseId);
  }
  const emExecucao = new Set();
  return Object.freeze({
    async executar({ hotelId, enterpriseId, ateUtc, listarBloqueios, modo = 'incremental' }) {
      if (mapa.get(hotelId) !== enterpriseId || !mapa.has(hotelId)) throw new Error('escopo_nao_autorizado');
      if (typeof listarBloqueios !== 'function') throw new Error('cliente_invalido');
      if (!['incremental', 'reconciliacao'].includes(modo)) throw new Error('modo_invalido');
      if (emExecucao.has(hotelId)) throw new Error('execucao_concorrente');
      const ate = dataUtc(ateUtc);
      const escopo = { tenantId, hotelId, enterpriseId };
      const anterior = armazenamento.ler(escopo);
      if (modo === 'incremental' && anterior.checkpointUtc && ate <= dataUtc(anterior.checkpointUtc))
        throw new Error('checkpoint_nao_avanca');
      if (modo === 'reconciliacao' && !anterior.checkpointUtc) throw new Error('bootstrap_necessario');
      if (modo === 'reconciliacao' && anterior.checkpointVarreduraUtc &&
          ate <= dataUtc(anterior.checkpointVarreduraUtc)) throw new Error('varredura_nao_avanca');
      const desde = anterior.checkpointUtc ? dataUtc(anterior.checkpointUtc) - sobreposicaoMinutos * 60000 : null;
      if (modo === 'incremental' && desde !== null && ate - desde > 30 * MS_DIA)
        throw new Error('intervalo_longo_exige_fatiamento');
      const janela = modo === 'reconciliacao' || !anterior.checkpointUtc
        ? { CollidingUtc: { StartUtc: ateUtc, EndUtc: new Date(ate + horizonteDias * MS_DIA).toISOString() } }
        : { UpdatedUtc: { StartUtc: new Date(desde).toISOString(), EndUtc: ateUtc } };
      emExecucao.add(hotelId);
      try {
        const resposta = await listarBloqueios([enterpriseId], janela);
        if (!Array.isArray(resposta)) throw new Error('lista_invalida');
        const dados = new Map(anterior.bloqueios.map(b => [b.Id, copia(b)]));
        const recebidos = new Set();
        for (const bruto of resposta) {
          if (!bruto || typeof bruto.Id !== 'string' || !bruto.Id ||
              bruto.EnterpriseId !== enterpriseId) throw new Error('bloqueio_fora_do_escopo');
          const stamp = dataUtc(bruto.UpdatedUtc);
          recebidos.add(bruto.Id);
          // Conserva somente campos tecnicos permitidos.
          const seguro = Object.fromEntries(
            ['Id','EnterpriseId','AssignedResourceId','Type','StartUtc','EndUtc','IsActive','DeletedUtc','UpdatedUtc']
              .filter(c => Object.hasOwn(bruto, c)).map(c => [c, bruto[c]])
          );
          const velho = dados.get(seguro.Id);
          // Em empate de UpdatedUtc, tombstone sempre vence: jamais reativar por replay.
          const tombstone = item => item.IsActive === false || item.DeletedUtc != null;
          if (!velho || stamp > dataUtc(velho.UpdatedUtc) ||
            (stamp === dataUtc(velho.UpdatedUtc) && tombstone(seguro) && !tombstone(velho))) {
            dados.set(seguro.Id, seguro);
          }
        }
        // Ausencia na janela nao indica exclusao, inclusive na reconciliacao.
        const salvo = armazenamento.confirmar(escopo, anterior.revisao, {
          modo, checkpointUtc: ateUtc, bloqueios: [...dados.values()],
        });
        return Object.freeze({
          modo, janela: copia(janela), checkpointUtc: salvo.checkpointUtc,
          checkpointVarreduraUtc: salvo.checkpointVarreduraUtc,
          revisao: salvo.revisao, quantidade: salvo.bloqueios.length,
          recebidos: recebidos.size, gravouNoHubKeep: false, gerouOs: false,
        });
      } finally {
        emExecucao.delete(hotelId);
      }
    },
  });
}
