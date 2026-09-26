-- ============================================================================
-- Operações offline recebidas (F0-11, migração 0006): os casos mínimos do
-- doc 02 para app.operacao_offline. A chave é do usuário: cada um só lê e grava
-- as próprias linhas, e a linha não muda depois de gravada.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

grant usage on schema extensions to hk_app, hk_worker, hk_ingestao;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'tecnico.a@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'tecnico.a2@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'tecnico.b@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Técnico A', 'tecnico.a@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Técnico A2', 'tecnico.a2@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Técnico B', 'tecnico.b@b.test');

insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   '0193a000-0000-4000-8000-0000000000a2', 'preferencias.gravar', '{"aplicada": true}'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   '0193a000-0000-4000-8000-0000000000b1', 'preferencias.gravar', '{"aplicada": true}');

-- Integridade (como postgres)
select throws_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000f1', 'preferencias.gravar', '{}') $$,
  '23503', null, 'operação de quem só é membro de outro tenant é recusada pela FK composta');
select throws_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000f2', 'DROP TABLE', '{}') $$,
  '23514', null, 'tipo fora do formato dominio.acao é recusado');

-- Caso 5 — sem contexto
set local role hk_app;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.operacao_offline', 'sem contexto: nada visível');
select throws_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000c1', 'preferencias.gravar', '{}') $$,
  '42501', null, 'sem contexto: não grava');

-- Técnico A
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.operacao_offline',
  'técnico A não vê a operação do colega do mesmo tenant');
select lives_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000a1', 'preferencias.gravar', '{"aplicada": true}') $$,
  'técnico A grava a própria operação');
select lives_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000a2', 'preferencias.gravar', '{"aplicada": true}') $$,
  'a mesma chave do colega é outra operação (a chave é por usuário)');
select is_empty(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000a1', 'preferencias.gravar', '{"aplicada": false}')
     on conflict do nothing returning 1 $$,
  'chave repetida do próprio usuário não entra de novo');
select throws_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
      '0193a000-0000-4000-8000-0000000000c2', 'preferencias.gravar', '{}') $$,
  '42501', null, 'técnico A não grava operação em nome do colega');
select throws_ok(
  $$ update app.operacao_offline set resposta = '{}' $$,
  '42501', null, 'resposta guardada não muda (sem UPDATE)');
select throws_ok(
  $$ delete from app.operacao_offline $$,
  '42501', null, 'sem DELETE');

-- Caso 1 — outro tenant
select throws_ok(
  $$ insert into app.operacao_offline (tenant_id, usuario_id, chave, tipo, resposta) values
     ('20000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
      '0193a000-0000-4000-8000-0000000000c3', 'preferencias.gravar', '{}') $$,
  '42501', null, 'técnico A não grava no tenant B');
reset role;

-- Worker e ingestão não tocam a tabela
set local role hk_worker;
select throws_ok('select 1 from app.operacao_offline', '42501', null, 'worker não lê operação offline');
reset role;
set local role hk_ingestao;
select throws_ok('select 1 from app.operacao_offline', '42501', null, 'ingestão não lê operação offline');
reset role;

select * from finish();
rollback;
