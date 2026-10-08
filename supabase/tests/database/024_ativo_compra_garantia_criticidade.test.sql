-- ============================================================================
-- Compra, garantia e criticidade do ativo (migração 0030, fase 1b I1). As
-- colunas são de uma tabela que já tem os seis casos no 013; aqui, o que a
-- migração muda:
--   1. a criticidade só de 1 a 5 (ou nula), pelo banco;
--   2. as três colunas têm UPDATE para o hk_app, e o worker não grava;
--   3. quem escreve no hotel altera; admin de outro tenant, gerente de outro
--      hotel, proprietário e implantador vencido, não;
--   4. sem contexto, nada.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(12);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar 101', 'frigobar 101'),
  ('Q000000002', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'Elevador H2', 'elevador h2'),
  ('Q000000003', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'Ativo B', 'ativo b');

-- 1 e 2 — escala e privilégios (como postgres)
select throws_ok(
  $$ update app.ativo set criticidade = 0 where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'criticidade abaixo de 1 recusada');
select throws_ok(
  $$ update app.ativo set criticidade = 6 where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'criticidade acima de 5 recusada');
select lives_ok(
  $$ update app.ativo set criticidade = null, data_compra = null, garantia_ate = null
     where id = 'a1000000-0000-0000-0000-000000000001' $$,
  'as três colunas aceitam nulo (não informado)');
select ok(
  has_column_privilege('hk_app', 'app.ativo', 'data_compra', 'UPDATE')
  and has_column_privilege('hk_app', 'app.ativo', 'garantia_ate', 'UPDATE')
  and has_column_privilege('hk_app', 'app.ativo', 'criticidade', 'UPDATE'),
  'data_compra, garantia_ate e criticidade com UPDATE para o hk_app');

set local role hk_app;

-- 4 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty($$ update app.ativo set criticidade = 3 returning 1 $$, 'sem contexto: nenhum ativo alterado');

-- 3 — admin de outro tenant
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.ativo set criticidade = 3
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera a criticidade do A');

-- 3 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.ativo set criticidade = 4, data_compra = '2024-01-10', garantia_ate = '2026-01-10'
  where id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente grava compra, garantia e criticidade no hotel dele');
select is_empty($$ update app.ativo set criticidade = 4
  where id = 'a2000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente não altera ativo de outro hotel');
select results_eq(
  $$ select criticidade::int, data_compra::text, garantia_ate::text from app.ativo
     where id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values (4, '2024-01-10'::text, '2026-01-10'::text) $$,
  'o gerente lê o que gravou');

-- 3 — proprietário vê o ativo da UH dele e não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty($$ update app.ativo set criticidade = 1 returning 1 $$, 'dono de UH não altera a criticidade');

-- 3 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty($$ update app.ativo set criticidade = 1 returning 1 $$, 'implantador vencido não altera a criticidade');
reset role;

-- 2 — o worker não grava ativo
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok($$ update app.ativo set criticidade = 1 $$, '42501', null, 'worker não grava a criticidade');
reset role;

select * from finish();
rollback;
