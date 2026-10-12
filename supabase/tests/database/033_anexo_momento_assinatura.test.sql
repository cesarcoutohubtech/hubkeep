-- ============================================================================
-- Foto antes ou depois e assinatura no aceite (migração 0041, fase 1b I8).
-- Checks (como postgres): o momento só com os valores do domínio e só em
-- anexo de OS; a assinatura só em PNG de OS, sem momento e sem miniatura; a
-- OS só aponta assinatura que é anexo dela mesma (FK composta); as fotos que
-- já existem ficam sem momento e sem a marca de assinatura.
-- A policy de UPDATE do anexo, alterada (casos do doc 02):
--   1. admin de outro tenant não vê nem grava a assinatura, nem a aponta na OS;
--   2. quem abriu o chamado, com escrita no hotel, grava a assinatura em nome
--      dele e a aponta na OS; ninguém remove a assinatura (nem o Gerente, nem
--      o Admin do grupo), e a foto comum continua removível;
--   4. técnico de outro hotel não aponta assinatura na OS do Hotel 1;
--   5. sem contexto, nada.
-- Mais: o técnico grava a foto com momento; sem DELETE; o worker lê as
-- colunas novas só no tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
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
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 e c2 (Hotel 1), abertos pelo solicitante; cada um com a sua OS concluída do técnico.
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'chuveiro', 'chuveiro', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000009'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'ar', 'ar', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000009');
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000009', 'concluida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000009', 'concluida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002');
-- f1: foto antiga da OS 1 (sem momento); s2: assinatura da OS 2.
insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id) values
  ('a0100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/f1.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004');
insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura) values
  ('a0100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000002/s2.png', 'image/png', 'aaaaaaaa-0000-0000-0000-000000000009', true);

-- Checks e FK (como postgres)
select results_eq(
  $$ select momento is null, assinatura from app.anexo where id = 'a0100000-0000-0000-0000-000000000001' $$,
  $$ values (true, false) $$, 'foto que já existe fica sem momento e não é assinatura');
select throws_ok(
  $$ update app.anexo set momento = 'durante' where id = 'a0100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'momento fora da lista do domínio');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id, momento)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local', '11110000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/m.jpg',
             'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004', 'antes') $$,
  '23514', null, 'momento só em anexo de OS');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id, assinatura)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local', '11110000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/s.png',
             'image/png', 'aaaaaaaa-0000-0000-0000-000000000004', true) $$,
  '23514', null, 'assinatura só em anexo de OS');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s.jpg',
             'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000009', true) $$,
  '23514', null, 'assinatura só em PNG');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura, momento)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s3.png',
             'image/png', 'aaaaaaaa-0000-0000-0000-000000000009', true, 'depois') $$,
  '23514', null, 'assinatura sem momento');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, miniatura_caminho, tipo, usuario_id, assinatura)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s4.png',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s4-m.png',
             'image/png', 'aaaaaaaa-0000-0000-0000-000000000009', true) $$,
  '23514', null, 'assinatura sem miniatura');
select throws_ok(
  $$ update app.os set assinatura_aceite_id = 'a0100000-0000-0000-0000-000000000002'
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a OS não aponta a assinatura de outra OS');
select throws_ok(
  $$ update app.os set assinatura_aceite_id = gen_random_uuid()
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a OS não aponta anexo que não existe');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.anexo where assinatura', 'sem contexto: nenhuma assinatura');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ select 1 from app.anexo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  'admin B não vê as assinaturas do A');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/b.png',
             'image/png', 'bbbbbbbb-0000-0000-0000-000000000001', true) $$,
  '42501', null, 'admin B não grava assinatura no A');
select is_empty($$ update app.os set assinatura_aceite_id = null
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$, 'admin B não mexe na assinatura da OS do A');

-- Caso 2 — o técnico grava a foto com momento
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, momento)
     values ('a0100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/f3.jpg',
             'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004', 'depois') $$,
  'técnico grava a foto "depois" da OS');
select results_eq(
  $$ select momento from app.anexo where id = 'a0100000-0000-0000-0000-000000000003' $$,
  $$ values ('depois') $$, 'o momento fica gravado');

-- Caso 2 — quem abriu o chamado grava a assinatura e a aponta na OS
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s5.png',
             'image/png', 'aaaaaaaa-0000-0000-0000-000000000002', true) $$,
  '42501', null, 'assinatura só em nome de quem grava');
select lives_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id, assinatura)
     values ('a0100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/s6.png',
             'image/png', 'aaaaaaaa-0000-0000-0000-000000000009', true) $$,
  'quem abriu o chamado grava a assinatura do aceite');
select isnt_empty($$ update app.os set assinatura_aceite_id = 'a0100000-0000-0000-0000-000000000004'
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'quem abriu aponta a assinatura na OS');
select is_empty($$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000009'
  where id = 'a0100000-0000-0000-0000-000000000004' returning 1 $$, 'quem assinou não remove a assinatura');

-- Caso 4 — técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ update app.os set assinatura_aceite_id = null
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'técnico do Hotel 2 não mexe na assinatura da OS do Hotel 1');

-- Caso 2 — gerente do Hotel 1: não remove a assinatura; a foto comum, sim
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select isnt_empty($$ select 1 from app.anexo where id = 'a0100000-0000-0000-0000-000000000004' and assinatura $$,
  'gerente vê a assinatura');
select is_empty($$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = 'a0100000-0000-0000-0000-000000000002' returning 1 $$, 'gerente não remove a assinatura');
select throws_ok(
  $$ update app.anexo set assinatura = false where id = 'a0100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'sem UPDATE na marca de assinatura');
select throws_ok(
  $$ update app.anexo set momento = 'antes' where id = 'a0100000-0000-0000-0000-000000000003' $$,
  '42501', null, 'sem UPDATE no momento da foto');
select isnt_empty($$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = 'a0100000-0000-0000-0000-000000000001' returning 1 $$, 'gerente remove a foto comum');

-- Admin A: também não remove a assinatura; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select is_empty($$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000001'
  where assinatura returning 1 $$, 'admin A não remove assinatura');
select throws_ok($$ delete from app.anexo where assinatura $$, '42501', null, 'sem DELETE em anexo');
reset role;

-- Worker lê as colunas novas, só no tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ select assinatura_aceite_id::text from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('a0100000-0000-0000-0000-000000000004') $$, 'worker lê a assinatura do aceite');
select results_eq(
  $$ select count(*)::int from app.anexo where momento = 'depois' $$,
  $$ values (1) $$, 'worker lê o momento da foto');
select results_eq('select count(distinct tenant_id)::int from app.anexo', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
