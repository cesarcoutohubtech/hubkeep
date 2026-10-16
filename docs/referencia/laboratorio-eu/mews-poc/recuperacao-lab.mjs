/**
 * Laboratorio offline: porta de armazenamento e reconciliacao Mews.
 * NAO conecta Mews, Supabase ou HubKeep. Nao usar em producao.
 * O adaptador simula transacoes atomicas com compare-and-swap por hotel.
 */
import { criarRepositorioSimulado, prepararLote } from './checkpoint-contrato.mjs';

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
/**
 * Compatibilidade do laboratorio com o contrato CANONICO do PR #304.
 * Nao mantem Map/snapshot proprio: todos os commits vao para
 * criarRepositorioSimulado() em checkpoint-contrato.mjs.
 * Dados de recursos nos testes sao estritamente sintéticos, derivando
 * IDs de recurso dos bloqueios. Integracao real exigira listarRecursos
 * autorizado e validado na Mews; nao usar este adaptador em producao.
 */
export function criarArmazenamentoSimulado() {
  const repositorio = criarRepositorioSimulado();
  return Object.freeze({
    ler(escopo) {
      const salvo = repositorio.consultar(escopo);
      if (!salvo) {
        return { revisao: 0, checkpointUtc: null, checkpointVarreduraUtc: null, bloqueios: [] };
      }
      const prefixo = `${escopo.enterpriseId}|`;
      const blocos = salvo.bloqueios.map(item => ({
        Id: item.codigoExterno.slice(prefixo.length),
        EnterpriseId: escopo.enterpriseId,
        AssignedResourceId: item.codigoRecurso.slice(prefixo.length),
        Type: item.tipoBloqueio,
        StartUtc: item.inicio,
        EndUtc: item.fim,
        IsActive: item.ativoNoPms,
        UpdatedUtc: item.atualizadoEm,
      }));
      return { revisao: salvo.versao, checkpointUtc: salvo.checkpointUtc,
        checkpointVarreduraUtc: salvo.checkpointVarreduraUtc, bloqueios: blocos };
    },
    confirmar(escopo, revisaoEsperada, novo) {
      const atual = repositorio.consultar(escopo);
      if ((atual?.versao ?? 0) !== revisaoEsperada) throw new Error('conflito_de_revisao');
      if (!novo || !Array.isArray(novo.bloqueios)) throw new Error('snapshot_invalido');
      const modo = novo.modo ?? 'incremental';
      if (!['incremental', 'reconciliacao'].includes(modo)) throw new Error('modo_invalido');
      const recursos = new Map();
      const bloqueios = novo.bloqueios.map(bruto => {
        if (!bruto || typeof bruto.Id !== 'string' || !bruto.Id ||
            bruto.EnterpriseId !== escopo.enterpriseId) throw new Error('bloqueio_invalido');
        if (typeof bruto.AssignedResourceId !== 'string' || !bruto.AssignedResourceId) {
          throw new Error('recurso_invalido');
        }
        dataUtc(bruto.UpdatedUtc);
        if (bruto.DeletedUtc != null) dataUtc(bruto.DeletedUtc);
        if (bruto.Type !== 'OutOfOrder' && bruto.Type !== 'InternalUse') {
          throw new Error('tipo_bloqueio_invalido');
        }
        dataUtc(bruto.StartUtc);
        dataUtc(bruto.EndUtc);
        const resourceId = bruto.AssignedResourceId;
        const codigoRecurso = `${escopo.enterpriseId}|${resourceId}`;
        if (!recursos.has(codigoRecurso)) {
          recursos.set(codigoRecurso, {
            ...escopo, resourceId, codigoExterno: codigoRecurso,
            ativoNoPms: true, atualizadoEm: null,
          });
        }
        return {
          ...escopo,
          codigoExterno: `${escopo.enterpriseId}|${bruto.Id}`,
          codigoRecurso,
          tipoBloqueio: bruto.Type,
          inicio: bruto.StartUtc,
          fim: bruto.EndUtc,
          ativoNoPms: bruto.IsActive !== false && bruto.DeletedUtc == null,
          atualizadoEm: bruto.UpdatedUtc,
        };
      });
      const checkpointEsperado = modo === 'incremental'
        ? (atual?.checkpointUtc ?? null)
        : (atual?.checkpointVarreduraUtc ?? null);
      const plano = prepararLote({ ...escopo, modo,
        versaoEsperada: revisaoEsperada, checkpointEsperado,
        novoCheckpoint: novo.checkpointUtc,
        espacos: [...recursos.values()], bloqueios });
      repositorio.aplicar(plano);
      return this.ler(escopo);
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
