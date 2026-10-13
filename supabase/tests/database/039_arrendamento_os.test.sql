-- ============================================================================
-- Responsável do arrendamento na OS (migração 0047, fase 1c item 6; ADR-045).
-- Checks (como postgres): a marca só com os valores do domínio; as OS que já
-- existem ficam sem marca e sem hora do aviso.
-- A policy de UPDATE da OS não muda; o GRANT por coluna novo (casos do doc 02):
--   1. admin de outro tenant não vê nem grava a marca;
--   2. o Gerente do hotel grava a marca e a hora do aviso; o Admin do grupo
--      também;
--   4. técnico de outro hotel não grava a marca na OS do Hotel 1;
--   5. sem contexto, nada.
-- Mais: o locador (proprietário do hotel inteiro, ADR-031) lê a marca, mas
-- não grava; a coluna de escopo segue sem UPDATE; sem DELETE; o worker lê as
-- colunas novas só no tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(18);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'locador@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status, modelo_contratual) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo', 'arrendado'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo', null),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo', null);
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Locador do Hotel 1');
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio, vigencia_fim) values
  ('11300000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11100000-0000-0000-0000-000000000001', current_date - 30, null);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (Hotel 1, arrendado), aberto pelo solicitante, com a OS atribuída ao técnico.
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'ar', 'ar', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000009');
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000009', 'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002');

-- Checks (como postgres)
select results_eq(
  $$ select responsavel_arrendamento is null, locador_avisado_em is null from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values (true, true) $$, 'a OS que já existe fica sem marca e sem hora do aviso');
select throws_ok(
  $$ update app.os set responsavel_arrendamento = 'proprietario' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'marca fora da lista do domínio');
select lives_ok(
  $$ update app.os set responsavel_arrendamento = 'arrendataria' where id = '0a100000-0000-0000-0000-000000000001' $$,
  'a arrendatária vale');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty($$ update app.os set responsavel_arrendamento = 'locador' returning 1 $$,
  'sem contexto: nenhuma OS marcada');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ select 1 from app.os where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  'admin B não vê as OS do A');
select is_empty($$ update app.os set responsavel_arrendamento = 'locador'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não marca a OS do A');

-- Caso 2 — o Gerente do Hotel 1 marca a OS do locador e grava a hora do aviso
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.os set responsavel_arrendamento = 'locador'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'o Gerente marca a OS como do locador');
select isnt_empty($$ update app.os set locador_avisado_em = '2026-10-13T12:00:00Z'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'o Gerente grava a hora do aviso');
select throws_ok(
  $$ update app.os set hotel_id = '11100000-0000-0000-0000-000000000002' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a coluna de escopo segue sem UPDATE');
select throws_ok($$ delete from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem DELETE na OS');

-- Caso 4 — técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ update app.os set responsavel_arrendamento = 'arrendataria'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'técnico do Hotel 2 não marca a OS do Hotel 1');

-- O locador lê a marca e a hora do aviso, mas não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq(
  $$ select responsavel_arrendamento, locador_avisado_em from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('locador'::text, '2026-10-13T12:00:00Z'::timestamptz) $$, 'o locador lê a marca e a hora do aviso');
select is_empty($$ update app.os set responsavel_arrendamento = 'arrendataria'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'o locador não muda a marca');

-- O Admin do grupo também marca
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select isnt_empty($$ update app.os set responsavel_arrendamento = 'arrendataria'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'o Admin do grupo marca a OS');
select results_eq(
  $$ select responsavel_arrendamento, locador_avisado_em is not null from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('arrendataria'::text, true) $$, 'a hora do aviso fica, mesmo com a marca de volta na arrendatária');
reset role;

-- Worker lê as colunas novas, só no tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ select responsavel_arrendamento from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('arrendataria'::text) $$, 'worker lê a marca');
select results_eq('select count(distinct tenant_id)::int from app.os', $$ values (1) $$,
  'worker vê só o tenant do job');
select throws_ok(
  $$ update app.os set responsavel_arrendamento = 'locador' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não grava a marca');
reset role;

select * from finish();
rollback;
