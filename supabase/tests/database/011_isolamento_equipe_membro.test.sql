-- ============================================================================
-- Isolamento de app.equipe_membro (migração 0009, fase 1a A6): os seis casos
-- mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava membro de equipe de outro hotel;
--   3. técnico e proprietário do hotel leem e não gravam;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta recusa membro de outro tenant e equipe de outro hotel.
-- Mais: o gerente do hotel tira membro (desativação lógica), sem DELETE.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

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
insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta (como postgres)
select throws_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'equipe_membro: quem só é membro de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  '23503', null, 'equipe_membro: equipe de outro hotel é recusada pela FK (hotel_id, equipe_id)');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.equipe_membro', 'sem contexto: nenhum membro de equipe');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select equipe_id from app.equipe_membro', $$ values ('e2000000-0000-0000-0000-000000000001'::uuid) $$,
  'admin B vê só os membros de equipe do B');
select throws_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'admin B não põe membro em equipe do A');

-- Caso 2 — gerente do hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select equipe_id from app.equipe_membro', $$ values ('e1000000-0000-0000-0000-000000000002'::uuid) $$,
  'gerente do H2 vê só os membros das equipes do H2');
select is_empty($$ update app.equipe_membro set ativo = false
  where equipe_id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente do H2 não tira membro de equipe do H1');
select throws_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente do H2 não põe membro em equipe do H1');

-- Gerente do hotel 1: gerencia os membros das equipes do próprio hotel
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente do H1 põe membro em equipe do H1');
select isnt_empty($$ update app.equipe_membro set ativo = false
  where equipe_id = 'e1000000-0000-0000-0000-000000000001' and usuario_id = 'aaaaaaaa-0000-0000-0000-000000000004' returning 1 $$,
  'gerente do H1 tira membro da equipe do H1');
select throws_ok($$ delete from app.equipe_membro $$, '42501', null, 'sem DELETE em membro de equipe');

-- Caso 3 — técnico e proprietário do hotel 1: leem, não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq('select count(*)::int from app.equipe_membro', $$ values (2) $$, 'técnico do H1 vê os membros das equipes do H1');
select is_empty($$ update app.equipe_membro set ativo = true returning 1 $$, 'técnico não altera membro de equipe');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq('select count(*)::int from app.equipe_membro', $$ values (2) $$, 'proprietário do hotel lê os membros das equipes do hotel');
select throws_ok(
  $$ insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id) values
     ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não põe membro em equipe');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.equipe_membro', 'implantador vencido não vê membro de equipe');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.equipe_membro', $$ values (1) $$, 'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
