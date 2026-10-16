import test from 'node:test';
import assert from 'node:assert/strict';
import { criarArmazenamentoSimulado, criarReconciliadorLaboratorio } from './recuperacao-lab.mjs';

const escopo = { tenantId:'tenant-a', hotelId:'hotel-a', enterpriseId:'ent-a' };
const escopoB = { tenantId:'tenant-b', hotelId:'hotel-b', enterpriseId:'ent-b' };
const b = (id, updated='2026-10-16T12:00:00Z', demais={}) =>
  ({ Id:id, EnterpriseId:'ent-a', AssignedResourceId:'room-1', UpdatedUtc:updated, ...demais });
function sync(db, vinculos=[{hotelId:'hotel-a',enterpriseId:'ent-a'}], tenantId='tenant-a') {
  return criarReconciliadorLaboratorio({ armazenamento:db, tenantId, vinculos });
}
const rodar = (s, at, lista, modo='incremental') =>
  s.executar({ hotelId:'hotel-a', enterpriseId:'ent-a', ateUtc:at, modo, listarBloqueios:async()=>lista });
test('bootstrap grava checkpoint e somente campos permitidos', async()=>{
  const db=criarArmazenamentoSimulado();
  const result=await rodar(sync(db),'2026-10-16T13:00:00Z',[b('a',undefined,{Notes:'PII'})]);
  assert.equal(result.revisao,1);
  assert.equal(db.ler(escopo).bloqueios[0].Notes,undefined);
  assert.equal(result.gravouNoHubKeep,false);
});
test('novo sincronizador recupera estado do armazenamento compartilhado',async()=>{
  const db=criarArmazenamentoSimulado();
  await rodar(sync(db),'2026-10-16T13:00:00Z',[b('a')]);
  const res=await rodar(sync(db),'2026-10-16T14:00:00Z',[b('b','2026-10-16T13:30:00Z')]);
  assert.equal(res.revisao,2);
  assert.equal(db.ler(escopo).bloqueios.length,2);
});
test('falha de rede nao avanca checkpoint e permite replay',async()=>{
  const db=criarArmazenamentoSimulado(), s=sync(db);
  await rodar(s,'2026-10-16T13:00:00Z',[b('a')]);
  await assert.rejects(s.executar({hotelId:'hotel-a',enterpriseId:'ent-a',ateUtc:'2026-10-16T14:00:00Z',listarBloqueios:async()=>{throw Error('rede');}}),/rede/);
  assert.equal(db.ler(escopo).revisao,1);
  await rodar(s,'2026-10-16T14:00:00Z',[b('b')]);
  assert.equal(db.ler(escopo).revisao,2);
});
test('conflito CAS recusa commit baseado em estado antigo',()=>{
  const db=criarArmazenamentoSimulado();
  db.confirmar(escopo,0,{checkpointUtc:'2026-10-16T13:00:00Z',bloqueios:[]});
  assert.throws(()=>db.confirmar(escopo,0,{checkpointUtc:'2026-10-16T14:00:00Z',bloqueios:[]}),/conflito_de_revisao/);
});
test('tombstone recente prevalece sobre evento antigo',async()=>{
  const db=criarArmazenamentoSimulado(),s=sync(db);
  await rodar(s,'2026-10-16T13:00:00Z',[b('a','2026-10-16T12:00:00Z',{DeletedUtc:'2026-10-16T12:00:00Z',IsActive:false})]);
  await rodar(s,'2026-10-16T14:00:00Z',[b('a','2026-10-16T11:00:00Z',{IsActive:true})]);
  assert.equal(db.ler(escopo).bloqueios[0].IsActive,false);
});
test('reconciliacao nao remove bloqueio omitido',async()=>{
  const db=criarArmazenamentoSimulado(),s=sync(db);
  await rodar(s,'2026-10-16T13:00:00Z',[b('a')]);
  const r=await rodar(s,'2026-10-16T14:00:00Z',[],'reconciliacao');
  assert.ok(r.janela.CollidingUtc);
  assert.equal(db.ler(escopo).bloqueios.length,1);
});
test('outra propriedade falha antes de publicar estado',async()=>{
  const db=criarArmazenamentoSimulado();
  await assert.rejects(rodar(sync(db),'2026-10-16T13:00:00Z',[{...b('a'),EnterpriseId:'ent-b'}]),/bloqueio_fora_do_escopo/);
  assert.equal(db.ler(escopo).revisao,0);
});
test('tenants distintos usam estados separados',async()=>{
  const db=criarArmazenamentoSimulado();
  await rodar(sync(db),'2026-10-16T13:00:00Z',[b('a')]);
  const outro=sync(db,[{hotelId:'hotel-b',enterpriseId:'ent-b'}],'tenant-b');
  await outro.executar({hotelId:'hotel-b',enterpriseId:'ent-b',ateUtc:'2026-10-16T13:00:00Z',
    listarBloqueios:async()=>[{...b('z'),EnterpriseId:'ent-b'}]});
  assert.equal(db.ler(escopoB).bloqueios[0].Id,'z');
  assert.equal(db.ler(escopo).bloqueios[0].Id,'a');
});
test('impede concorrencia no mesmo hotel',async()=>{
  const db=criarArmazenamentoSimulado(),s=sync(db);
  let liberar;const bloqueio=new Promise(resolve=>{liberar=resolve;});
  const primeiro=s.executar({hotelId:'hotel-a',enterpriseId:'ent-a',ateUtc:'2026-10-16T13:00:00Z',
    listarBloqueios:()=>bloqueio});
  await assert.rejects(rodar(s,'2026-10-16T13:00:00Z',[]),/execucao_concorrente/);
  liberar([]);
  await primeiro;
});
test('retorno mutavel nao altera armazenamento',async()=>{
  const db=criarArmazenamentoSimulado();
  db.confirmar(escopo,0,{checkpointUtc:'2026-10-16T13:00:00Z',bloqueios:[b('a')]});
  const l=db.ler(escopo);l.bloqueios[0].Id='mudado';
  assert.equal(db.ler(escopo).bloqueios[0].Id,'a');
});
