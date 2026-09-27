-- ============================================================================
-- Políticas e configuração do tenant (migração 0010, fase 1a A7): os casos
-- mínimos do doc 02 para app.politica e o UPDATE de app.tenant.
--   - todo membro do tenant lê as políticas (a resolução roda para todos);
--   - só o Admin do grupo grava, e só no próprio tenant;
--   - escopo coerente, uma linha por chave em cada escopo, sem DELETE;
--   - FK composta recusa hotel de outro tenant;
--   - só o Admin altera país, moeda e idioma do próprio tenant.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'Técnico', 'tecnico@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B1', 'UTC', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.politica (id, tenant_id, escopo_tipo, chave, valor, atualizado_por) values
  ('f1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'grupo', 'os.aceite_automatico', '{"ligado": false, "dias": 7}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'grupo', 'os.aceite_automatico', '{"ligado": true, "dias": 3}', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Integridade (como postgres)
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'hotel', '21100000-0000-0000-0000-000000000001', 'os.aceite_automatico', '{}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'politica: hotel de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'grupo', '11100000-0000-0000-0000-000000000001', 'os.aceite_automatico', '{}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'politica: escopo grupo com hotel é incoerente');
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'grupo', 'os.aceite_automatico', '{}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'politica: uma linha por chave no escopo do grupo');
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'grupo', 'Chave Inválida', '{}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'politica: nome de chave fora do formato dominio.chave');

set local role hk_app;

-- Sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.politica', 'sem contexto: nenhuma política');

-- Técnico do tenant A: lê, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select valor->>'dias' from app.politica $$, $$ values ('7') $$, 'técnico lê a política do próprio tenant');
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'hotel', '11100000-0000-0000-0000-000000000001', 'os.aceite_automatico', '{}', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não grava política');
select is_empty($$ update app.politica set valor = '{}' returning 1 $$, 'técnico não altera política');
select is_empty($$ update app.tenant set moeda = 'USD' returning 1 $$, 'técnico não altera o tenant');

-- Admin B: só o B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select valor->>'dias' from app.politica $$, $$ values ('3') $$, 'admin B vê só a política do B');
select is_empty($$ update app.politica set valor = '{}' where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera política do A');
select is_empty($$ update app.tenant set moeda = 'USD' where id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera o tenant A');

-- Admin A: grava política de hotel, altera a do grupo e configura o tenant
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, hotel_id, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'hotel', '11100000-0000-0000-0000-000000000001', 'os.aceite_automatico', '{"ligado": true, "dias": 5}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin grava política do hotel');
select throws_ok(
  $$ insert into app.politica (id, tenant_id, escopo_tipo, chave, valor, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'grupo', 'chamado.outra', '{}', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'admin não grava política em nome de outro (atualizado_por é quem grava)');
select isnt_empty($$ update app.tenant set pais = 'CL', moeda = 'CLP', idioma_padrao = 'es' returning 1 $$,
  'admin configura país, moeda e idioma do tenant');
select throws_ok($$ update app.tenant set nome = 'x' $$, '42501', null, 'o nome do tenant não é alterável pelo hk_app');
select throws_ok($$ delete from app.politica $$, '42501', null, 'sem DELETE em política');
reset role;

select * from finish();
rollback;
