import test from 'node:test';
import assert from 'node:assert/strict';
import { criarEnsaioVinculoDemo } from './ensaio-vinculo-demo.mjs';

const TENANT = 'ca100000-0000-0000-0000-000000000000';
const HOTEL = 'ca200000-0000-0000-0000-000000000001';
const OUTRO = 'cb200000-0000-0000-0000-000000000001';
const EMPRESA = 'mews-gross-demo-teste';
const FIM = '2026-10-18T18:00:00Z';
const INICIO = '2026-10-18T12:00:00Z';

function recurso(extra = {}) {
  return {
    Id: 'R-1', EnterpriseId: EMPRESA, Name: 'Quarto 101',
    State: 'Clean', IsActive: true, UpdatedUtc: INICIO,
    Data: { Discriminator: 'Space', Value: { FloorNumber: '1' } },
    Notes: 'PII-NÃO-PERSISTIR', Guest: { Email: 'privado@exemplo.test' },
    ...extra,
  };
}
function bloqueio(extra = {}) {
  return {
    Id: 'B-1', EnterpriseId: EMPRESA, AssignedResourceId: 'R-1',
    Type: 'OutOfOrder', StartUtc: FIM,
    EndUtc: '2026-10-19T18:00:00Z', UpdatedUtc: INICIO,
    IsActive: true, Notes: 'PII-NÃO-PERSISTIR',
    ...extra,
  };
}
function ambiente({ propriedades = EMPRESA, recursos = [recurso()],
  bloqueios = [bloqueio()], escopo = {}, chamadas = [], delay = null } = {}) {
  return {
    chamadas,
    cliente: {
      async obterIdentificadorEmpresa() {
        chamadas.push('configuracao');
        if (delay) await delay();
        return propriedades;
      },
      async listarRecursos(ids) {
        chamadas.push('recursos');
        assert.deepEqual(ids, [EMPRESA]);
        return recursos;
      },
      async listarBloqueios(ids, filtro) {
        chamadas.push('bloqueios');
        assert.deepEqual(ids, [EMPRESA]);
        assert.deepEqual(Object.keys(filtro), ['CollidingUtc']);
        return bloqueios;
      },
    },
    async consultarEscopo(recebido) {
      chamadas.push('escopo');
      assert.deepEqual(recebido, { tenantId: TENANT, hotelId: HOTEL, enterpriseId: EMPRESA });
      return {
        ...recebido, hotelAtivo: true, conferidoPorAdmin: true,
        origem: 'mews-demo', revogado: false,
        enterpriseIdVinculado: null,
        ...escopo,
      };
    },
  };
}
function ensaio(ambienteTeste, opts = {}) {
  return criarEnsaioVinculoDemo({
    cliente: ambienteTeste.cliente, consultarEscopo: ambienteTeste.consultarEscopo,
    tenantId: TENANT, hotelId: HOTEL, enterpriseId: EMPRESA, ...opts,
  });
}

test('resumo de Space e OutOfOrder nao expõe nomes, IDs ou PII e nao persiste', async () => {
  const x = ambiente();
  const r = await ensaio(x).executar({ ateUtc: FIM });
  assert.deepEqual(x.chamadas, ['escopo', 'configuracao', 'recursos', 'bloqueios']);
  assert.deepEqual(r, {
    estado: 'preview_nao_persistido', ultimoUpdatedUtc: FIM,
    recursosAtivos: 1, bloqueiosOutOfOrder: 1, bloqueiosInternalUse: 0,
    persistiuNoHubKeep: false, gerouOs: false, alterouUh: false, gravouNaMews: false,
  });
  assert.ok(!JSON.stringify(r).includes('PII-NÃO-PERSISTIR'));
  assert.ok(!JSON.stringify(r).includes('R-1'));
  assert.ok(!JSON.stringify(r).includes(EMPRESA));
  assert.equal(Object.isFrozen(r), true);
});

test('conta apenas Space e tipos tecnicos permitidos (nao deduz UH)', async () => {
  const x = ambiente({
    recursos: [recurso(), recurso({ Id: 'SALA', Data: { Discriminator: 'Service' } })],
    bloqueios: [bloqueio(), bloqueio({ Id: 'B-2', Type: 'InternalUse' }),
      bloqueio({ Id: 'B-3', Type: 'Other' })],
  });
  const r = await ensaio(x).executar({ ateUtc: FIM });
  assert.equal(r.recursosAtivos, 1);
  assert.equal(r.bloqueiosOutOfOrder, 1);
  assert.equal(r.bloqueiosInternalUse, 1);
});

test('recusa hotel inativo antes de consultar propriedade Mews', async () => {
  const x = ambiente({ escopo: { hotelAtivo: false } });
  await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /mews_vinculo_nao_confirmado/);
  assert.deepEqual(x.chamadas, ['escopo']);
});

test('recusa ausencia de validacao humana e vinculo revogado antes de rede', async () => {
  for (const escopo of [{ conferidoPorAdmin: false }, { revogado: true }, { origem: 'prod' }]) {
    const x = ambiente({ escopo });
    await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /mews_vinculo_nao_confirmado/);
    assert.deepEqual(x.chamadas, ['escopo']);
  }
});

test('recusa vinculo preexistente com outra propriedade', async () => {
  const x = ambiente({ escopo: { enterpriseIdVinculado: 'outra' } });
  await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /mews_vinculo_nao_confirmado/);
  assert.deepEqual(x.chamadas, ['escopo']);
});

test('recusa tenant ou hotel divergente e IDs invalidos', async () => {
  const x = ambiente({ escopo: { hotelId: OUTRO } });
  await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /mews_vinculo_nao_confirmado/);
  assert.deepEqual(x.chamadas, ['escopo']);
  assert.throws(() => ensaio(ambiente(), { hotelId: 'hotel nao UUID' }),
    /mews_ensaio_configuracao_invalida/);
});

test('Mews configuration/get divergente nao consulta recursos nem bloqueios', async () => {
  const x = ambiente({ propriedades: 'propriedade-nao-autorizada' });
  await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /mews_empresa_divergente/);
  assert.deepEqual(x.chamadas, ['escopo', 'configuracao']);
});

test('dados com EnterpriseId errado falham fechado sem resultado parcial', async () => {
  const x = ambiente({ recursos: [recurso({ EnterpriseId: 'outro-enterprise' })] });
  await assert.rejects(ensaio(x).executar({ ateUtc: FIM }), /recurso_fora_do_escopo/);
  assert.deepEqual(x.chamadas, ['escopo', 'configuracao', 'recursos', 'bloqueios']);
});

test('bloqueio sem recurso do hotel é descartado pela normalizacao segura', async () => {
  const x = ambiente({ bloqueios: [bloqueio({ AssignedResourceId: 'R-OUTRO' })] });
  const r = await ensaio(x).executar({ ateUtc: FIM });
  assert.equal(r.bloqueiosOutOfOrder, 0);
});

test('data UTC inválida falha antes de qualquer consulta ou chamada Mews', async () => {
  const x = ambiente();
  await assert.rejects(ensaio(x).executar({ ateUtc: '2026-10-18' }), /mews_instante_invalido/);
  assert.deepEqual(x.chamadas, []);
});

test('exige uma única execução e não publica sucesso depois de timeout', async () => {
  let liberar;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const x = ambiente({ delay: () => espera });
  const e = ensaio(x);
  const pendente = e.executar({ ateUtc: FIM });
  await assert.rejects(e.executar({ ateUtc: FIM }), /mews_ensaio_unico/);
  liberar();
  await pendente;
  await assert.rejects(e.executar({ ateUtc: FIM }), /mews_ensaio_unico/);

  const y = ambiente();
  y.cliente.listarRecursos = async () => { throw new Error('timeout_de_leitura'); };
  await assert.rejects(ensaio(y).executar({ ateUtc: FIM }), /timeout_de_leitura/);
});

test('nenhum identificador sai mesmo com recurso inativo e bloqueio tombstone', async () => {
  const x = ambiente({ recursos: [recurso({ IsActive: false, DeletedUtc: INICIO })],
    bloqueios: [bloqueio({ IsActive: false, DeletedUtc: INICIO })] });
  const r = await ensaio(x).executar({ ateUtc: FIM });
  assert.equal(r.recursosAtivos, 0);
  assert.equal(r.bloqueiosOutOfOrder, 0);
  assert.equal('hotelId' in r, false);
  assert.equal('digest' in r, false);
});
