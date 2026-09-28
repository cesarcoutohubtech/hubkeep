-- ============================================================================
-- Isolamento de app.equipe (migração 0009, fase 1a A6): os seis casos
-- mínimos do doc 02, mais quem gerencia. Os de app.equipe_membro estão no
-- 011_isolamento_equipe_membro.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava equipe de outro hotel;
--   3. proprietário de hotel lê e não grava; técnico lê e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta recusa hotel de outro tenant.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente.h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gerente.h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico.h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador.vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario.h1@a.test'),
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
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B1', 'UTC', 'ativo');

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.equipe (id, tenant_id, hotel_id, nome) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Elétrica H1'),
  ('e1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'Hidráulica H2'),
  ('e2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'Equipe B');

-- Caso 6 — FK composta (como postgres)
select throws_ok(
  $$ insert into app.equipe (id, tenant_id, hotel_id, nome) values
     ('e1000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'x') $$,
  '23503', null, 'equipe: hotel de outro tenant é recusado pela FK composta');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.equipe', 'sem contexto: equipe vazia');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.equipe', $$ values ('Equipe B') $$, 'admin B: equipe, só B');
select throws_ok(
  $$ insert into app.equipe (id, tenant_id, hotel_id, nome) values
     ('e1000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'admin B não cria equipe no tenant A');

-- Caso 2 — gerente do hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.equipe', $$ values ('Hidráulica H2') $$, 'gerente do H2 vê só a equipe do H2');
select is_empty($$ update app.equipe set nome = 'x' where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente do H2 não altera equipe do H1');

-- Gerente do hotel 1: gerencia a equipe do próprio hotel
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.equipe (id, tenant_id, hotel_id, nome) values
     ('e1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Pintura H1') $$,
  'gerente do H1 cria equipe no H1');
select throws_ok(
  $$ delete from app.equipe where id = 'e1000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'sem DELETE em equipe');

-- Caso 3 — técnico e proprietário do hotel 1: leem, não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq('select count(*)::int from app.equipe', $$ values (2) $$, 'técnico do H1 vê as equipes do H1');
select is_empty($$ update app.equipe set nome = 'x' returning 1 $$, 'técnico não altera equipe');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq('select count(*)::int from app.equipe', $$ values (2) $$, 'proprietário do hotel lê as equipes do hotel');
select throws_ok(
  $$ insert into app.equipe (id, tenant_id, hotel_id, nome) values
     ('e1000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'proprietário não cria equipe');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.equipe', 'implantador vencido não vê equipe');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.equipe', $$ values (1) $$, 'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
