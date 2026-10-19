/**
 * Ensaio isolado de leitura Mews Demo -> candidato a painel HubKeep.
 *
 * Nao conecta ao banco, nao cria vinculo, nao publica checkpoint e nao
 * importa driver/worker de persistencia. O cliente e a consulta de escopo
 * sao injetados (nos testes, 100% sintéticos). Nao usar como API ou cron.
 */
import { criarSincronizadorPreview } from './sincronizacao-preview.mjs';
import { prepararLote } from './checkpoint-contrato.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MAX_ITENS = 10000;

function identificador(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && v === v.trim();
}
function instanteUtc(v) {
  if (typeof v !== 'string' || !UTC.test(v) || !Number.isFinite(Date.parse(v))) {
    throw new Error('mews_instante_invalido');
  }
}
function conferirAutorizacao(r, escopo) {
  // Porta confiavel a ser implementada pelo servidor com papel de leitura
  // e contexto da transacao; uma flag enviada pelo navegador NAO e prova.
  if (!r || r.tenantId !== escopo.tenantId || r.hotelId !== escopo.hotelId ||
      r.hotelAtivo !== true || r.conferidoPorAdmin !== true ||
      r.origem !== 'mews-demo' || r.revogado !== false ||
      (r.enterpriseIdVinculado != null &&
       r.enterpriseIdVinculado !== escopo.enterpriseId)) {
    throw new Error('mews_vinculo_nao_confirmado');
  }
}

/**
 * @param {object} opts
 * @param {{obterIdentificadorEmpresa: Function, listarRecursos: Function, listarBloqueios: Function}} opts.cliente
 * @param {(escopo:object)=>Promise<object>} opts.consultarEscopo
 * @param {string} opts.tenantId
 * @param {string} opts.hotelId
 * @param {string} opts.enterpriseId
 */
export function criarEnsaioVinculoDemo({ cliente, consultarEscopo, tenantId, hotelId, enterpriseId }) {
  if (!UUID.test(tenantId) || !UUID.test(hotelId) || !identificador(enterpriseId) ||
      !cliente || typeof cliente.obterIdentificadorEmpresa !== 'function' ||
      typeof cliente.listarRecursos !== 'function' ||
      typeof cliente.listarBloqueios !== 'function' ||
      typeof consultarEscopo !== 'function') {
    throw new Error('mews_ensaio_configuracao_invalida');
  }
  const escopo = Object.freeze({ tenantId, hotelId, enterpriseId });
  let executando = false;
  let concluido = false;
  return Object.freeze({
    async executar({ ateUtc }) {
      if (executando || concluido) throw new Error('mews_ensaio_unico');
      // Nenhuma consulta Mews, nem sequer configuration/get, sem data valida.
      instanteUtc(ateUtc);
      executando = true;
      try {
        const confirmacao = await consultarEscopo({ ...escopo });
        conferirAutorizacao(confirmacao, escopo);

        // configuration/get (single-property). Nao depender de enterprises/getAll.
        const propriedadeDaCredencial = await cliente.obterIdentificadorEmpresa();
        if (propriedadeDaCredencial !== enterpriseId) {
          throw new Error('mews_empresa_divergente');
        }

        const preview = criarSincronizadorPreview({
          cliente, tenantId,
          vinculos: [{ hotelId, enterpriseId }],
        });
        const candidatos = await preview.executar({ ...escopo, ateUtc });
        if (candidatos.espacos.length + candidatos.bloqueios.length > MAX_ITENS) {
          throw new Error('mews_lote_excessivo');
        }

        // Exercita o MESMO digest e allowlist do driver SQL, sem chamar aplicar.
        // Apenas o resumo abaixo atravessa esta fronteira.
        const plano = prepararLote({
          ...escopo,
          modo: 'incremental',
          versaoEsperada: 0,
          checkpointEsperado: null,
          novoCheckpoint: candidatos.checkpointUtc,
          espacos: candidatos.espacos,
          bloqueios: candidatos.bloqueios,
        });
        const ativos = plano.espacos.filter((r) => r.ativoNoPms);
        const blocos = plano.bloqueios.filter((b) => b.ativoNoPms);
        const resultado = Object.freeze({
          estado: 'preview_nao_persistido',
          ultimoUpdatedUtc: plano.novoCheckpoint,
          recursosAtivos: ativos.length,
          bloqueiosOutOfOrder: blocos.filter((b) => b.tipoBloqueio === 'OutOfOrder').length,
          bloqueiosInternalUse: blocos.filter((b) => b.tipoBloqueio === 'InternalUse').length,
          persistiuNoHubKeep: false,
          gerouOs: false,
          alterouUh: false,
          gravouNaMews: false,
        });
        concluido = true;
        return resultado;
      } finally {
        executando = false;
      }
    },
  });
}
