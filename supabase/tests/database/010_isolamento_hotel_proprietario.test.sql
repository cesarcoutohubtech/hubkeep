-- ============================================================================
-- Proprietário de hotel inteiro (migração 0011, fase 1a A4; ADR-031):
--   - os seis casos do doc 02 para app.hotel_proprietario (leitura e escrita
--     só do Admin do grupo, como app.proprietario);
--   - authz.locais_proprietario(): o proprietário vinculado ao hotel vê todos
--     os locais dele, inclusive UH nova que chega depois, e o próprio hotel;
--     não grava; vigência encerrada tira o acesso; o vínculo por UH continua.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-encerrado@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'dono-uh@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', 'admin@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Gerente', 'gerente@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'Implantador vencido', 'implantador-vencido@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'Dono do hotel', 'dono-hotel@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'Dono encerrado', 'dono-encerrado@a.test'),
  ('10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'Dono de UH', 'dono-uh@a.test'),
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('21100000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B1', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'area_comum', 'Piscina', 'ativo'),
  ('11110000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'ativo'),
  ('11110000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 202', 'ativo'),
  ('21110000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21100000-0000-0000-0000-000000000001', 'uh', 'UH B101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 1'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono encerrado do Hotel 2'),
  ('11200000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Dono da UH 202'),
  ('21200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Dono B');
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio, vigencia_fim) values
  ('11300000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11100000-0000-0000-0000-000000000001', current_date - 30, null),
  ('11300000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000002', current_date - 30, current_date - 1),
  ('21300000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '21200000-0000-0000-0000-000000000001',
   '21100000-0000-0000-0000-000000000001', current_date - 30, null);
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000003',
   '11110000-0000-0000-0000-000000000004', current_date - 30);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000003', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

-- FK composta e vigência (como postgres)
select throws_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
      '21100000-0000-0000-0000-000000000001', current_date) $$,
  '23503', null, 'hotel_proprietario: hotel de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '21200000-0000-0000-0000-000000000001',
      '11100000-0000-0000-0000-000000000001', current_date) $$,
  '23503', null, 'hotel_proprietario: proprietário de outro tenant é recusado pela FK composta');
select throws_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio, vigencia_fim) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
      '11100000-0000-0000-0000-000000000002', current_date, current_date - 1) $$,
  '23514', null, 'hotel_proprietario: vigência que termina antes de começar');

set local role hk_app;

-- Sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.hotel_proprietario', 'sem contexto: nenhum vínculo');

-- Dono do Hotel 1: todos os locais do hotel e o hotel; não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select nome from app.local order by nome $$, $$ values ('Piscina'), ('UH 101') $$,
  'dono do hotel vê todos os locais do hotel, UH e área comum');
select results_eq($$ select nome from app.hotel $$, $$ values ('Hotel 1') $$, 'dono do hotel vê só o hotel dele');
select is_empty('select 1 from app.hotel_proprietario', 'dono não lê os vínculos (dado do proprietário, só o Admin)');
select throws_ok(
  $$ insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'area_comum', 'X', 'ativo') $$,
  '42501', null, 'dono do hotel não cria local');
select is_empty($$ update app.hotel set nome = 'x' returning 1 $$, 'dono do hotel não altera o hotel');
select throws_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
      '11100000-0000-0000-0000-000000000002', current_date) $$,
  '42501', null, 'dono não se vincula a outro hotel');

-- UH nova do CM no Hotel 1 entra no escopo sem ação manual
reset role;
insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'ativo');
set local role hk_app;
select results_eq($$ select nome from app.local order by nome $$, $$ values ('Piscina'), ('UH 101'), ('UH 102') $$,
  'UH nova no hotel vinculado entra no escopo do dono');

-- Dono com vigência encerrada: nada
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.local', 'vigência encerrada: nenhum local');
select is_empty('select 1 from app.hotel', 'vigência encerrada: nenhum hotel');

-- Dono de UH: o vínculo por UH continua valendo, só a UH dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select nome from app.local $$, $$ values ('UH 202') $$, 'dono de UH vê só a UH dele');

-- Gerente do Hotel 1: não vê nem grava vínculo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.hotel_proprietario', 'gerente não vê vínculos de proprietário');
select throws_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000003',
      '11100000-0000-0000-0000-000000000001', current_date) $$,
  '42501', null, 'gerente não vincula proprietário ao hotel');

-- Implantador vencido: nada
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.hotel_proprietario', 'implantador vencido não vê vínculos');

-- Admin B: só o B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.hotel_proprietario $$, $$ values ('21300000-0000-0000-0000-000000000001'::uuid) $$,
  'admin B vê só o vínculo do B');
select is_empty($$ update app.hotel_proprietario set vigencia_fim = current_date
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera vínculo do A');

-- Admin A: vincula, encerra; escopo fixo; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000003',
      '11100000-0000-0000-0000-000000000002', current_date) $$,
  'admin vincula proprietário ao hotel');
select isnt_empty($$ update app.hotel_proprietario set vigencia_fim = current_date - 1
                     where id = '11300000-0000-0000-0000-000000000001' returning 1 $$,
  'admin encerra a vigência do vínculo');
select throws_ok($$ update app.hotel_proprietario set hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'hotel do vínculo não é alterável (campo de escopo)');
select throws_ok($$ delete from app.hotel_proprietario $$, '42501', null, 'sem DELETE em vínculo');

-- Vigência encerrada pelo Admin tira o acesso do dono do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty('select 1 from app.local', 'depois do encerramento, o dono não vê mais os locais');
reset role;

select * from finish();
rollback;
