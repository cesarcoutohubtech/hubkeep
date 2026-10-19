import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSincronizadorPreview } from './sincronizacao-preview.mjs';

const DATA='2026-10-16T14:00:00Z';
const DATA2='2026-10-16T15:00:00Z';
const resource=(EnterpriseId='e1')=>({Id:'r1',EnterpriseId,Name:'101',State:'Clean',IsActive:true,
  UpdatedUtc:DATA,Notes:'nao-persistir',Data:{Discriminator:'Space',Value:{FloorNumber:'1',GuestName:'Privado'}}});
const block=(extras={})=>({Id:'b1',EnterpriseId:'e1',AssignedResourceId:'r1',Type:'OutOfOrder',
  StartUtc:DATA,EndUtc:DATA2,UpdatedUtc:DATA,IsActive:true,Notes:'nome-hospede',...extras});
const vinculos=[{hotelId:'hotel1',enterpriseId:'e1'}];
const nova=(cliente,options={})=>criarSincronizadorPreview({cliente,tenantId:'tenantA',vinculos,...options});
const q=(sync, date=DATA)=>sync.executar({tenantId:'tenantA',hotelId:'hotel1',enterpriseId:'e1',ateUtc:date});

test('primeiro ciclo tem janela CollidingUtc, checkpoint e projeção segura', async()=>{
  let filtro;
  const s=nova({listarRecursos:async()=>[resource()],listarBloqueios:async(ids,f)=>{filtro=f;return [block()]}});
  const r=await q(s);
  assert.deepEqual(filtro,{CollidingUtc:{StartUtc:DATA,EndUtc:'2026-11-15T14:00:00Z'}});
  assert.equal(r.checkpointUtc,DATA);
  assert.equal(r.bloqueios.length,1);
  assert.equal(r.espacos.length,1);
  assert.equal(r.gravouNoHubKeep,false);
  assert.equal(r.gerouOs,false);
  assert.ok(!JSON.stringify(r).includes('nome-hospede'));
  assert.ok(!JSON.stringify(r).includes('Privado'));
  assert.equal(s.checkpoint({tenantId:'tenantA',hotelId:'hotel1'}),DATA);
});

test('próxima rodada usa UpdatedUtc sobreposto e preserva exclusão mais recente', async()=>{
  const filtros=[];let i=0;
  const cliente={listarRecursos:async()=>[resource()],listarBloqueios:async(_,f)=>{
    filtros.push(f);return i++===0?[block()]:[block({UpdatedUtc:DATA2,DeletedUtc:DATA2,IsActive:false})]}};
  const s=nova(cliente);
  await q(s);
  const r=await q(s,DATA2);
  assert.deepEqual(filtros[1],{UpdatedUtc:{StartUtc:'2026-10-16T13:55:00Z',EndUtc:DATA2}});
  assert.equal(r.bloqueios.length,1);
  assert.equal(r.bloqueios[0].ativoNoPms,false);
  assert.equal(r.bloqueiosNestaRodada,1);
});

test('página incremental vazia NÃO implica exclusão de bloqueio', async()=>{
  let n=0;const s=nova({listarRecursos:async()=>[resource()],listarBloqueios:async()=>n++?[]:[block()]});
  await q(s);const r=await q(s,DATA2);
  assert.equal(r.bloqueios.length,1);
  assert.equal(r.bloqueios[0].ativoNoPms,true);
});

test('se listagem falha o checkpoint não avança e snapshot anterior fica intacto', async()=>{
  let n=0;const s=nova({listarRecursos:async()=>[resource()],listarBloqueios:async()=>{
    if(n++)throw Error('429');return [block()];}});
  await q(s);await assert.rejects(q(s,DATA2),/429/);
  assert.equal(s.checkpoint({tenantId:'tenantA',hotelId:'hotel1'}),DATA);
});

test('escopo cross-tenant e outra propriedade falham antes de consultar o cliente', async()=>{
  let calls=0;const s=nova({listarRecursos:async()=>{calls++;return [resource()]},listarBloqueios:async()=>[]});
  await assert.rejects(s.executar({tenantId:'tenantB',hotelId:'hotel1',enterpriseId:'e1',ateUtc:DATA}),/escopo_nao_autorizado/);
  await assert.rejects(s.executar({tenantId:'tenantA',hotelId:'hotel1',enterpriseId:'e2',ateUtc:DATA}),/escopo_nao_autorizado/);
  assert.throws(()=>s.checkpoint({tenantId:'tenantB',hotelId:'hotel1'}),/escopo_nao_autorizado/);
  assert.equal(calls,0);
});

test('registro de outra propriedade invalida rodada e não altera checkpoint', async()=>{
  const s=nova({listarRecursos:async()=>[resource('e2')],listarBloqueios:async()=>[]});
  await assert.rejects(q(s),/recurso_fora_do_escopo/);
  assert.equal(s.checkpoint({tenantId:'tenantA',hotelId:'hotel1'}),null);
});

test('timestamp de bloco inválido não avança checkpoint', async()=>{
  const s=nova({listarRecursos:async()=>[resource()],listarBloqueios:async()=>[block({UpdatedUtc:'nunca'})]});
  await assert.rejects(q(s),/instante_utc_invalido/);
  assert.equal(s.checkpoint({tenantId:'tenantA',hotelId:'hotel1'}),null);
});

test('interrompe janela incremental maior que 30 dias', async()=>{
  let calls=0;const s=nova({listarRecursos:async()=>{calls++;return [resource()]},listarBloqueios:async()=>[block()]});
  await q(s);
  await assert.rejects(q(s,'2026-11-20T14:00:00Z'),/intervalo_longo_exige_fatiamento/);
  assert.equal(calls,1);
});

test('impede execuções simultâneas no mesmo hotel',async()=>{
  let done;const pending =new Promise(resolve=>{done=resolve});
  const s=nova({listarRecursos:async()=>{await pending;return [resource()]},listarBloqueios:async()=>[]});
  const one=q(s);
  await assert.rejects(q(s,DATA2),/sincronizacao_concorrente/);
  done();await one;
});

test('rejeita hotel duplicado e checkpoint regressivo',async()=>{
  assert.throws(()=>criarSincronizadorPreview({cliente:{listarRecursos(){},listarBloqueios(){}},tenantId:'t',
    vinculos:[...vinculos,{hotelId:'hotel1',enterpriseId:'e2'}]}),/hotel_duplicado/);
  const s=nova({listarRecursos:async()=>[resource()],listarBloqueios:async()=>[]});
  await q(s);
  await assert.rejects(q(s),/checkpoint_nao_avanca/);
});
