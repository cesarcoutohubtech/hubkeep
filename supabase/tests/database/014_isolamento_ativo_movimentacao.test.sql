-- ============================================================================
-- Isolamento de app.ativo_movimentacao (migração 0016, fase 1a B3c; adendo ao
-- ADR-011): os seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava movimentações de outro hotel;
--   3. proprietário (de UH ou de hotel inteiro) não lê movimentação no MVP e
--      não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta rejeita ativo e local de outro hotel, hotel de outro
--      tenant e usuário de outro tenant; origem e destino distintos.
-- Mais: quem grava é o usuário do contexto (RLS); sem UPDATE (a linha nasce e
-- não muda); sem DELETE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(20);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-hotel@a.test'),
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
insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'ativo'),
  ('11120000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Bar H2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'ativo'),
  ('22210000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Bar B', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 1');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', current_date - 1);
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.ativo (id, tenant_id, hotel_id, local_id, nome) values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', 'Frigobar'),
  ('a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000002', 'Máquina de gelo'),
  ('ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000002', 'Ativo B');
insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002'),
  ('e2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e check (como postgres)
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'FK rejeita ativo de outro hotel');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'FK rejeita local de destino em outro hotel');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      'ab000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000002',
      'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'FK rejeita hotel e ativo de outro tenant');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'FK rejeita usuário de outro tenant');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'origem e destino precisam ser distintos');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.ativo_movimentacao', 'sem contexto: nenhuma movimentação');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.ativo_movimentacao $$,
  $$ values ('eb000000-0000-0000-0000-000000000001'::uuid) $$, 'admin B vê só as movimentações do B');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não grava movimentação no A');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.ativo_movimentacao $$,
  $$ values ('e1000000-0000-0000-0000-000000000001'::uuid) $$, 'gerente vê só as movimentações do hotel dele');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não grava movimentação em outro hotel');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não grava movimentação em nome de outro usuário');
select lives_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente grava movimentação no hotel dele, em nome dele');
select throws_ok(
  $$ update app.ativo_movimentacao set movido_em = now() $$,
  '42501', null, 'sem UPDATE em movimentação');

-- Caso 3 — proprietários não leem nem gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.ativo_movimentacao', 'dono de UH não lê movimentação');
select throws_ok(
  $$ insert into app.ativo_movimentacao (id, tenant_id, hotel_id, ativo_id, local_origem_id, local_destino_id, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'dono de UH não grava movimentação');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty('select 1 from app.ativo_movimentacao', 'dono de hotel inteiro não lê movimentação');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.ativo_movimentacao', 'implantador vencido não vê movimentação');

-- Admin A: vê o tenant todo; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq('select count(*)::int from app.ativo_movimentacao', $$ values (3) $$,
  'admin A vê as movimentações de todos os hotéis do tenant');
select throws_ok($$ delete from app.ativo_movimentacao $$, '42501', null, 'sem DELETE em movimentação');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.ativo_movimentacao', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
