-- ============================================================================
-- Bandeiras (migração 0008, fase 1a A2): só o Admin do grupo cria, renomeia e
-- desativa; e trocar a bandeira do hotel muda, na hora, o que o Gestor CSC da
-- bandeira enxerga (escopo calculado na fonte, ADR-004).
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

grant usage on schema extensions to hk_app;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor.x@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'Gestor X', 'gestor.x@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente', 'gerente@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');

insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira X'),
  ('11000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000000', 'Bandeira Y');

insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
   '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo');

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, concedido_por)
values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003',
   'gestor_csc', 'bandeira', '11000000-0000-0000-0000-00000000000a', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

select results_eq(
  $$ select ativa from app.bandeira where id = '11000000-0000-0000-0000-00000000000a' $$,
  $$ values (true) $$, 'bandeira nova nasce ativa');

set local role hk_app;

-- Gestor da bandeira X vê o Hotel 1.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select nome from app.hotel', $$ values ('Hotel 1') $$, 'gestor da bandeira X vê o hotel da bandeira X');
select is_empty($$ update app.bandeira set ativa = false returning 1 $$, 'gestor CSC não desativa bandeira');

-- Gerente: não cria nem desativa bandeira.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select throws_ok(
  $$ insert into app.bandeira (id, tenant_id, nome) values
     ('11000000-0000-0000-0000-0000000000cc', '10000000-0000-0000-0000-000000000000', 'Nova') $$,
  '42501', null, 'gerente não cria bandeira');
select is_empty($$ update app.bandeira set ativa = false returning 1 $$, 'gerente não desativa bandeira');

-- Admin B: nada do tenant A.
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.bandeira set ativa = false
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não desativa bandeira do A');

-- Admin A: desativa a Y e troca a bandeira do Hotel 1 para a Y.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.bandeira set ativa = false
  where id = '11000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin desativa bandeira');
select isnt_empty($$ update app.bandeira set ativa = true
  where id = '11000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin reativa bandeira');
select isnt_empty($$ update app.hotel set bandeira_id = '11000000-0000-0000-0000-00000000000b'
  where id = '11100000-0000-0000-0000-000000000001' returning 1 $$, 'admin troca a bandeira do hotel');

-- Na transação seguinte do gestor da X, o Hotel 1 sumiu.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select is_empty('select 1 from app.hotel', 'gestor da bandeira X deixa de ver o hotel que foi para a Y');
reset role;

select * from finish();
rollback;
