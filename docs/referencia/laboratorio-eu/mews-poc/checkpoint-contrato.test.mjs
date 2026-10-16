import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRepositorioSimulado, prepararLote } from './checkpoint-contrato.mjs';

const D0 = '2026-10-16T10:00:00Z';
const D1 = '2026-10-16T11:00:00Z';
const D2 = '2026-10-16T12:00:00Z';
const escopo = { tenantId: 'tenantA', hotelId: 'hotelA', enterpriseId: 'e1' };
const quarto = (extra = {}) => ({
  ...escopo, resourceId: 'r1', codigoExterno: 'e1|r1',
  ativoNoPms: true, atualizadoEm: D1, Notes: 'dado pessoal proibido', ...extra,
});
const bloqueio = (extra = {}) => ({
  ...escopo, codigoExterno: 'e1|b1', codigoRecurso: 'e1|r1',
  tipoBloqueio: 'OutOfOrder', inicio: D0, fim: D2, atualizadoEm: D1,
  ativoNoPms: true, Notes: 'hospede privado', ...extra,
});
const plano = (extra = {}) => prepararLote({
  ...escopo, checkpointEsperado: null, novoCheckpoint: D1,
  espacos: [quarto()], bloqueios: [bloqueio()], ...extra,
});

test('commit simulado publica projeção e checkpoint juntos sem PII', () => {
  const store = criarRepositorioSimulado();
  const r = store.aplicar(plano());
  assert.equal(r.resultado, 'aplicado');
  const estado = store.consultar(escopo);
  assert.equal(estado.checkpointUtc, D1);
  assert.equal(estado.espacos.length, 1);
  assert.equal(estado.bloqueios.length, 1);
  assert.ok(!JSON.stringify(estado).includes('hospede privado'));
  assert.ok(!JSON.stringify(estado).includes('dado pessoal proibido'));
});

test('mesmo lote e checkpoint podem ser reexecutados sem duplicação', () => {
  const store = criarRepositorioSimulado(), p = plano();
  store.aplicar(p);
  assert.equal(store.aplicar(p).resultado, 'replay_idempotente');
  assert.equal(store.consultar(escopo).bloqueios.length, 1);
});

test('dois workers com mesmo checkpoint esperado conflitam após o primeiro commit', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  assert.throws(
    () => store.aplicar(plano({ novoCheckpoint: D2 })),
    /conflito_checkpoint_cas/,
  );
  assert.equal(store.consultar(escopo).checkpointUtc, D1);
});

test('falha antes do commit simula rollback de itens e checkpoint', () => {
  const store = criarRepositorioSimulado();
  assert.throws(
    () => store.aplicar(plano(), { falharAntesCommit: true }),
    /falha_simulada_sem_commit/,
  );
  assert.equal(store.consultar(escopo), null);
});

test('tombstone mais recente não é reativado por evento antigo', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  store.aplicar(plano({
    checkpointEsperado: D1, novoCheckpoint: D2,
    bloqueios: [bloqueio({ atualizadoEm: D2, ativoNoPms: false })],
  }));
  assert.equal(store.consultar(escopo).bloqueios[0].ativoNoPms, false);
  store.aplicar(plano({
    checkpointEsperado: D2, novoCheckpoint: '2026-10-16T13:00:00Z',
    bloqueios: [bloqueio({ atualizadoEm: D0, ativoNoPms: true })],
  }));
  assert.equal(store.consultar(escopo).bloqueios[0].ativoNoPms, false);
});

test('página incremental vazia não apaga bloqueios anteriores', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  store.aplicar(plano({ checkpointEsperado: D1, novoCheckpoint: D2, bloqueios: [] }));
  assert.equal(store.consultar(escopo).bloqueios.length, 1);
});

test('outro tenant com mesmo hotel/enterprise não vê a projeção', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  assert.equal(store.consultar({ ...escopo, tenantId: 'tenantB' }), null);
});

test('recusa registro e vínculo de recurso de outra propriedade', () => {
  assert.throws(() => plano({ espacos: [quarto({ enterpriseId: 'e2' })] }), /item_fora_do_escopo/);
  assert.throws(() => plano({ bloqueios: [bloqueio({ codigoRecurso: 'e2|r1' })] }),
    /recurso_fora_do_escopo/);
  assert.throws(() => plano({ bloqueios: [bloqueio({ codigoRecurso: 'e1|outro' })] }),
    /bloqueio_sem_recurso_do_hotel/);
});

test('recusa registros duplicados e checkpoint regressivo', () => {
  assert.throws(() => plano({ bloqueios: [bloqueio(), bloqueio()] }), /item_duplicado/);
  assert.throws(() => plano({ checkpointEsperado: D1, novoCheckpoint: D0 }),
    /checkpoint_nao_avanca/);
});

test('plano não retém propriedades desconhecidas, segredos ou mudanças no input', () => {
  const origem = bloqueio();
  const p = plano({ bloqueios: [origem] });
  origem.ativoNoPms = false;
  assert.equal(p.bloqueios[0].ativoNoPms, true);
  assert.equal(p.bloqueios[0].Notes, undefined);
  assert.equal(Object.isFrozen(p.bloqueios[0]), true);
});

test('leitura do armazenamento não permite mutar cópia interna', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  const snap = store.consultar(escopo);
  snap.bloqueios[0].ativoNoPms = false;
  assert.equal(store.consultar(escopo).bloqueios[0].ativoNoPms, true);
});

test('um lote divergente com checkpoint já aplicado não é aceito como replay', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  assert.throws(
    () => store.aplicar(plano({ bloqueios: [bloqueio({ ativoNoPms: false })] })),
    /conflito_checkpoint_cas/,
  );
});


test('marcas incrementais e varredura nao se sobrescrevem', () => {
  const store = criarRepositorioSimulado();
  store.aplicar(plano());
  const sweep = plano({ modo:'reconciliacao', versaoEsperada:1,
    checkpointEsperado:D1, novoCheckpoint:D2, bloqueios:[] });
  store.aplicar(sweep);
  assert.equal(store.consultar(escopo).checkpointUtc,D1);
  assert.equal(store.consultar(escopo).checkpointVarreduraUtc,D2);
  store.aplicar(plano({ versaoEsperada:2, checkpointEsperado:D1,
    novoCheckpoint:'2026-10-16T13:00:00Z', bloqueios:[] }));
  assert.equal(store.consultar(escopo).checkpointUtc,'2026-10-16T13:00:00Z');
  assert.equal(store.consultar(escopo).checkpointVarreduraUtc,D2);
  assert.equal(store.consultar(escopo).versao,3);
});
test('revisao CAS compartilhada rejeita lote preparado antes da varredura', () => {
  const store=criarRepositorioSimulado();
  store.aplicar(plano());
  const obsoleto=plano({checkpointEsperado:D1,versaoEsperada:1,novoCheckpoint:D2});
  store.aplicar(plano({modo:'reconciliacao',checkpointEsperado:D1,
    novoCheckpoint:D2,versaoEsperada:1,bloqueios:[]}));
  assert.throws(()=>store.aplicar(obsoleto), /conflito_checkpoint_cas/);
  assert.equal(store.consultar(escopo).checkpointUtc,D1);
});
test('empate temporal entre tombstone e evento ativo conserva tombstone', () => {
  const store=criarRepositorioSimulado();
  store.aplicar(plano());
  store.aplicar(plano({checkpointEsperado:D1,novoCheckpoint:D2,
    bloqueios:[bloqueio({atualizadoEm:D1,ativoNoPms:false})]}));
  store.aplicar(plano({checkpointEsperado:D2,novoCheckpoint:'2026-10-16T13:00:00Z',
    bloqueios:[bloqueio({atualizadoEm:D1,ativoNoPms:true})]}));
  assert.equal(store.consultar(escopo).bloqueios[0].ativoNoPms,false);
});
test('varredura antes do primeiro incremental falha fechada', () => {
  const store=criarRepositorioSimulado();
  assert.throws(()=>store.aplicar(plano({modo:'reconciliacao'})),/bootstrap_necessario/);
  assert.equal(store.consultar(escopo),null);
});
test('replay do mesmo lote com revisao antiga e aceito pelo digest', () => {
  const store=criarRepositorioSimulado();
  const p=plano({versaoEsperada:0});
  assert.equal(store.aplicar(p).resultado,'aplicado');
  assert.equal(store.aplicar(p).resultado,'replay_idempotente');
});
