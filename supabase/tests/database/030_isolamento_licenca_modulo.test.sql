-- ============================================================================
-- Isolamento de licenca.modulo (migração 0037, fase 1b I7). Os seis casos
-- mínimos do doc 02:
--   1. admin de outro tenant não vê os módulos do tenant A e não grava;
--   2. gerente de hotel: a tabela não tem hotel_id (o módulo é do grupo),
--      então o caso vira "o gerente lê os módulos do grupo e não os grava";
--   3. o proprietário da UH lê e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK: o módulo só de tenant que existe; mais a integridade da tabela
--      (módulo na lista, vigência em ordem, um registro por módulo no tenant,
--      quem atualizou preenchido). A tabela não referencia outra do tenant
--      além de app.tenant, então não há FK composta a provar.
-- Mais: o hk_app e o hk_worker não gravam (nem o Admin do grupo); o
-- hk_backoffice grava e muda a vigência em qualquer tenant, mas não muda o
-- módulo nem o tenant; sem DELETE; o worker vê só o tenant do job; o
-- hk_ingestao não lê.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

grant usage on schema extensions to hk_app, hk_worker, hk_backoffice, hk_ingestao;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B'),
  ('30000000-0000-0000-0000-000000000000', 'Grupo C');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- A tem o Intelligence vigente, sem prazo; B teve, e o prazo acabou.
insert into licenca.modulo (id, tenant_id, modulo, inicio, fim, atualizado_por) values
  ('3a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'inteligencia',
   now() - interval '30 days', null, 'script de operação'),
  ('3b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'inteligencia',
   now() - interval '60 days', now() - interval '1 day', 'script de operação');

-- Caso 6 — FK e integridade (como postgres)
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '90000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'x') $$,
  '23503', null, 'módulo só de tenant que existe');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '30000000-0000-0000-0000-000000000000', 'custos', now(), 'x') $$,
  '23514', null, 'módulo só da lista do domínio');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, fim, atualizado_por) values
     (gen_random_uuid(), '30000000-0000-0000-0000-000000000000', 'inteligencia', now(), now() - interval '1 day', 'x') $$,
  '23514', null, 'o fim da vigência vem depois do início');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'x') $$,
  '23505', null, 'um registro por módulo no tenant');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '30000000-0000-0000-0000-000000000000', 'inteligencia', now(), '  ') $$,
  '23514', null, 'quem atualizou fica registrado');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from licenca.modulo', 'sem contexto: nenhum módulo');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from licenca.modulo $$,
  $$ values ('3b000000-0000-0000-0000-000000000001') $$, 'admin B vê só o módulo do B');
select is_empty(
  $$ select 1 from licenca.modulo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  'admin B não vê o módulo do A, nem pedindo pelo tenant');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'admin') $$,
  '42501', null, 'admin B não contrata módulo pelo hk_app');

-- Admin A: lê, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select modulo from licenca.modulo $$, $$ values ('inteligencia') $$,
  'admin A lê o módulo do grupo');
select throws_ok($$ update licenca.modulo set fim = now() $$, '42501', null,
  'admin A não muda a vigência pelo hk_app');
select throws_ok($$ delete from licenca.modulo $$, '42501', null, 'admin A não apaga módulo');

-- Caso 2 — gerente do Hotel 1: lê o módulo do grupo, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from licenca.modulo $$, $$ values (1) $$,
  'gerente lê o módulo do grupo');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'gerente') $$,
  '42501', null, 'gerente não contrata módulo');

-- Caso 3 — proprietário da UH: lê, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select count(*)::int from licenca.modulo $$, $$ values (1) $$,
  'proprietário lê o módulo do grupo');
select throws_ok($$ update licenca.modulo set fim = now() $$, '42501', null,
  'proprietário não muda a vigência');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from licenca.modulo', 'implantador vencido não vê módulo');
reset role;

-- Worker: só o tenant do job, sem gravar
set local role hk_worker;
select from (select set_config('app.usuario_id', '', true),
       set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from licenca.modulo $$,
  $$ values ('3a000000-0000-0000-0000-000000000001') $$, 'worker vê só o módulo do tenant do job');
select throws_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     (gen_random_uuid(), '30000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'worker') $$,
  '42501', null, 'worker não contrata módulo');
select throws_ok($$ update licenca.modulo set fim = now() $$, '42501', null,
  'worker não muda a vigência');
reset role;

-- Ingestão: nada na licença
set local role hk_ingestao;
select throws_ok('select 1 from licenca.modulo', '42501', null, 'ingestão não lê módulo');
reset role;

-- Backoffice: grava e muda a vigência em qualquer tenant; não muda módulo nem tenant; sem DELETE
set local role hk_backoffice;
select results_eq(
  $$ select count(*)::int from licenca.modulo
     where tenant_id in ('10000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000000') $$,
  $$ values (2) $$, 'backoffice lê os módulos de todos os tenants');
select lives_ok(
  $$ insert into licenca.modulo (id, tenant_id, modulo, inicio, atualizado_por) values
     ('3c000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000000', 'inteligencia', now(), 'script de operação') $$,
  'backoffice contrata o módulo para o tenant C');
select isnt_empty(
  $$ update licenca.modulo set fim = null, atualizado_em = now(), atualizado_por = 'script de operação'
     where id = '3b000000-0000-0000-0000-000000000001' returning 1 $$,
  'backoffice renova a vigência do B');
select throws_ok($$ update licenca.modulo set modulo = 'inteligencia' $$, '42501', null,
  'o módulo não é alterável');
select throws_ok($$ update licenca.modulo set tenant_id = '30000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do módulo não é alterável');
select throws_ok($$ update licenca.modulo set id = gen_random_uuid() $$, '42501', null,
  'o id do módulo não é alterável');
select throws_ok($$ delete from licenca.modulo $$, '42501', null, 'backoffice não apaga módulo');
select throws_ok('select 1 from app.membro', '42501', null,
  'backoffice continua sem ler tabela de negócio');
reset role;

-- Depois da renovação pelo backoffice, o admin B vê o módulo sem prazo
set local role hk_app;
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select fim is null from licenca.modulo $$, $$ values (true) $$,
  'admin B lê a vigência renovada pelo backoffice');
reset role;

select * from finish();
rollback;
