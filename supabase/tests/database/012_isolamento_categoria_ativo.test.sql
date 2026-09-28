-- ============================================================================
-- Isolamento de app.categoria_ativo (migração 0014, fase 1a B2; ADR-028): os
-- seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de hotel: a tabela não tem hotel_id (categoria é do tenant),
--      então o caso vira "lê as do tenant e não grava";
--   3. proprietário (de UH e de hotel inteiro sem locais) lê e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK: a tabela só referencia o tenant (sem hotel nem local); o caso
--      vira integridade: uma categoria padrão por tenant, formato da chave e
--      tipo dos jsonb.
-- Mais: só o Admin grava; chave_padrao não é alterável; sem DELETE; worker
-- vê só o tenant do job.
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
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Hotel 3', 'UTC', 'em_implantacao');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 3');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000003', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao, nomes) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'refrigeracao', '{}'),
  ('ca000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Saunas"}'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Categoria B"}');

-- Caso 6 — integridade (como postgres)
select throws_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'refrigeracao') $$,
  '23505', null, 'categoria padrão entra uma vez por tenant');
select lives_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
     (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'refrigeracao') $$,
  'a mesma categoria padrão em outro tenant');
select throws_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'Chave Inválida') $$,
  '23514', null, 'chave padrão fora do formato');
select throws_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, nomes, campos) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '[]', '{}') $$,
  '23514', null, 'nomes precisa ser objeto e campos, lista');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.categoria_ativo', 'sem contexto: nenhuma categoria');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.categoria_ativo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê categorias do A');
select is_empty($$ update app.categoria_ativo set ativa = false where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera categoria do A');
select throws_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}') $$,
  '42501', null, 'admin B não cria categoria no A');

-- Caso 2 — gerente do Hotel 1: lê as do tenant, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.categoria_ativo $$, $$ values (2) $$, 'gerente lê as categorias do tenant');
select throws_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}') $$,
  '42501', null, 'gerente não cria categoria');
select is_empty($$ update app.categoria_ativo set campos = '[]' returning 1 $$, 'gerente não altera categoria');

-- Caso 3 — proprietários leem, não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select count(*)::int from app.categoria_ativo $$, $$ values (2) $$, 'dono de UH lê as categorias do tenant');
select is_empty($$ update app.categoria_ativo set ativa = false returning 1 $$, 'dono de UH não altera categoria');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select count(*)::int from app.categoria_ativo $$, $$ values (2) $$,
  'dono de hotel inteiro, sem locais, lê as categorias do tenant');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.categoria_ativo', 'implantador vencido não vê categoria');

-- Admin A: cria e altera; chave padrão fixa; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select lives_ok(
  $$ insert into app.categoria_ativo (id, tenant_id, nomes) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Elevadores de carga"}') $$,
  'admin cria categoria');
select isnt_empty($$ update app.categoria_ativo set campos = '[{"chave": "potencia"}]'
                     where id = 'ca000000-0000-0000-0000-000000000002' returning 1 $$, 'admin altera os campos');
select throws_ok($$ update app.categoria_ativo set chave_padrao = 'eletrica' $$, '42501', null,
  'a chave padrão não é alterável');
select throws_ok($$ delete from app.categoria_ativo $$, '42501', null, 'sem DELETE em categoria');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.categoria_ativo', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
