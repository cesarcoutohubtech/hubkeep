-- ============================================================================
-- Atualização de app.membro (migração 0007, fase 1a A3): só o Admin do grupo
-- altera membro. O Implantador, o gerente e o técnico não alteram ninguém,
-- nem membro sem papel privilegiado do próprio hotel; o admin de outro tenant
-- também não. O INSERT pelo Implantador (convite) continua valendo.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(9);

grant usage on schema extensions to hk_app;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'implantador.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico.a1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'novo@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');

insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'Implantador A1', 'implantador.a1@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente A1', 'gerente.a1@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'Técnico A1', 'tecnico.a1@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');

insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel A1', 'UTC', 'ativo');

insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por)
values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007',
   'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001',
   'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

set local role hk_app;

-- Implantador do hotel A1: não desativa o técnico do próprio hotel (antes da 0007, podia).
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.membro set ativo = false
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000007' returning 1 $$,
  'implantador não desativa técnico do próprio hotel');
select is_empty($$ update app.membro set nome = 'x'
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1 $$,
  'implantador não altera gerente do próprio hotel');
select lives_ok(
  $$ insert into app.membro (tenant_id, usuario_id, nome, email) values
     ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'Novo', 'novo@a.test') $$,
  'implantador continua convidando (INSERT) membro sem papel privilegiado');

-- Gerente e técnico: não alteram ninguém, nem a si mesmos.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select is_empty($$ update app.membro set ativo = false
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000007' returning 1 $$,
  'gerente não desativa técnico');
select is_empty($$ update app.membro set ativo = true, nome = 'Gerente'
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1 $$,
  'gerente não altera o próprio cadastro');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ update app.membro set nome = 'x' returning 1 $$, 'técnico não altera membro');

-- Admin de outro tenant: nada do A.
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.membro set ativo = false
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera membro do tenant A');

-- Admin do A: desativa e reativa.
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.membro set ativo = false
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000007' returning 1 $$,
  'admin do grupo desativa o técnico');
select isnt_empty($$ update app.membro set ativo = true
  where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000007' returning 1 $$,
  'admin do grupo reativa o técnico');
reset role;

select * from finish();
rollback;
