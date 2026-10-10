-- ============================================================================
-- Isolamento do resultado diário por ativo (migração 0039, ADR-036):
-- app.metrica_ativo_diaria. Lê só quem decide, como no insight de hotel
-- (Cesar, 10/10/2026; aguarda o Kaio). Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava;
--   2. gerente do Hotel 1 vê só as linhas do Hotel 1; gestor da bandeira vê as
--      dos hotéis da bandeira e não as de outra; técnico, solicitante e
--      implantador do Hotel 1 não veem; ninguém da aplicação grava, atualiza
--      ou apaga;
--   3. o proprietário não vê (o Intelligence é gerencial): nem o da UH, nem o
--      do hotel inteiro, que tem escopo de hotel e por isso estaria em
--      hoteis_leitura;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: hotel do mesmo tenant, ativo do mesmo hotel.
-- Mais: um cálculo por (ativo, dia), número de cálculo e scores no formato,
-- versão da política obrigatória e curta, recálculo sem original, e o worker,
-- que só insere e só no tenant do job, sem atualizar nem apagar.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(33);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-b1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'solicitante-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'proprietario-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'implantador-h1@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira 1'),
  ('11000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000000', 'Bandeira 2'),
  ('22000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000000', 'Bandeira B');
-- H1 e H2 na Bandeira 1; H3 na Bandeira 2; HB no tenant B.
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 2', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000b', 'Hotel 3', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-00000000000a', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('11130000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'area_comum', 'Lobby H3', 'lobby h3', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', '11000000-0000-0000-0000-00000000000a', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'solicitante', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days','aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- a1: Hotel 1 (UH 101, do proprietário); a2: Hotel 2; a3: Hotel 3; ab: tenant B.
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar 101', 'frigobar 101'),
  ('Q000000003', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'Porta H2', 'porta h2'),
  ('Q000000004', 'a3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003',
   '11130000-0000-0000-0000-000000000001', 'Porta H3', 'porta h3'),
  ('QB00000001', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'Ativo B', 'ativo b');

-- m1: a1, dia 1, cálculo 1. m2: o recálculo do mesmo dia. m3: a2 (Hotel 2).
-- m4: a3 (Hotel 3, outra bandeira). mb: tenant B.
insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo, reincidencia, atencao,
    faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao) values
  ('3e000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', date '2026-09-29', 1, false, 55, 72, 'alta_atencao', 1, 2, 'padrao', '{}', '{}'),
  ('3e000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', date '2026-09-29', 2, true, 58, 75, 'alta_atencao', 1, 2, 'hotel:p1@2026-09-30', '{}', '{}'),
  ('3e000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001', date '2026-09-29', 1, false, null, null, 'dados_insuficientes', 1, 2, 'padrao', '{}', '{}'),
  ('3e000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003',
   'a3000000-0000-0000-0000-000000000001', date '2026-09-29', 1, false, 20, 35, 'observar', 1, 2, 'padrao', '{}', '{}'),
  ('3e000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000001', date '2026-09-29', 1, false, 10, 20, 'normal', 1, 2, 'padrao', '{}', '{}');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             'ab000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '23503', null, 'hotel de outro tenant');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a2000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '23503', null, 'ativo que não é do hotel da linha');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-29', 1, 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '23505', null, 'um cálculo por ativo, dia e número de cálculo (o job não duplica)');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', 0, 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '23514', null, 'o número de cálculo começa em 1');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, atencao, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', 101, 'critico', 1, 2, 'padrao', '{}', '{}') $$,
  '23514', null, 'score acima de 100');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, reincidencia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', -1, 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '23514', null, 'score negativo');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 0, 2, 'padrao', '{}', '{}') $$,
  '23514', null, 'a versão da fórmula começa em 1');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 1, 2, '', '{}', '{}') $$,
  '23514', null, 'a versão da política é obrigatória (a condição do Cesar de 07/10/2026)');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 1, 2, repeat('x', 2001), '{}', '{}') $$,
  '23514', null, 'a versão da política é curta (até 2000 caracteres)');
select lives_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values ('3e000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
             'a2000000-0000-0000-0000-000000000001', date '2026-09-20', 1, true, 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  'recálculo de um dia que nunca foi gravado entra com o cálculo 1, marcado');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'sem contexto: nenhuma linha');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.metrica_ativo_diaria where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê linhas do A');
select results_eq('select count(*)::int from app.metrica_ativo_diaria', $$ values (1) $$, 'admin B vê só a do tenant dele');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             'ab000000-0000-0000-0000-000000000001', date '2026-09-28', 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '42501', null, 'o hk_app não grava resultado diário (nasce do job)');

-- Admin do grupo A: vê as cinco linhas do tenant, e ninguém da aplicação atualiza nem apaga
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.metrica_ativo_diaria', $$ values (5) $$, 'admin do grupo vê as cinco linhas do A');
select throws_ok(
  $$ update app.metrica_ativo_diaria set atencao = 10 where id = '3e000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nada é atualizado: nem pelo admin do grupo');
select throws_ok(
  $$ delete from app.metrica_ativo_diaria where id = '3e000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nada é apagado: nem pelo admin do grupo');

-- Caso 2 — gestor CSC da Bandeira 1 (Hotel 1 e Hotel 2)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select array_agg(id order by id)::text from app.metrica_ativo_diaria $$,
  $$ values ('{3e000000-0000-0000-0000-000000000001,3e000000-0000-0000-0000-000000000002,3e000000-0000-0000-0000-000000000003,3e000000-0000-0000-0000-000000000005}') $$,
  'gestor da bandeira vê as linhas dos hotéis da bandeira');
select is_empty($$ select 1 from app.metrica_ativo_diaria where hotel_id = '11100000-0000-0000-0000-000000000003' $$,
  'gestor da bandeira não vê o Hotel 3, de outra bandeira');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select array_agg(id order by id)::text from app.metrica_ativo_diaria $$,
  $$ values ('{3e000000-0000-0000-0000-000000000001,3e000000-0000-0000-0000-000000000002}') $$,
  'gerente vê só as linhas do hotel dele, com o original e o recálculo');
select is_empty($$ select 1 from app.metrica_ativo_diaria where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  'gerente não vê o Hotel 2');

-- Caso 2 — técnico, solicitante e implantador do Hotel 1: não leem (o Intelligence é gerencial)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'técnico não vê resultado diário');
select throws_ok(
  $$ update app.metrica_ativo_diaria set atencao = 10 where id = '3e000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'técnico não atualiza');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'solicitante não vê resultado diário');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'implantador não vê resultado diário');

-- Caso 3 — proprietário da UH 101 (Hotel 1)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'proprietário da UH não vê resultado diário');

-- Caso 3 — proprietário do Hotel 1 inteiro (escopo de hotel, está em hoteis_leitura)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'proprietário do hotel inteiro não vê resultado diário');

-- Caso 4 — implantador vencido do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.metrica_ativo_diaria', 'implantador vencido não vê nada');

-- Worker: só o tenant do job, só INSERT
reset role;
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.metrica_ativo_diaria', $$ values (1) $$,
  'worker vê só o tenant do job');
select lives_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, calculo, recalculo, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'a1000000-0000-0000-0000-000000000001', date '2026-09-29', 3, true, 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  'worker grava o recálculo seguinte do mesmo dia');
select throws_ok(
  $$ insert into app.metrica_ativo_diaria (id, tenant_id, hotel_id, ativo_id, dia, faixa_atencao, versao_formula_reincidencia, versao_formula_atencao, versao_politica, detalhe_reincidencia, detalhe_atencao)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             'ab000000-0000-0000-0000-000000000001', date '2026-09-27', 'normal', 1, 2, 'padrao', '{}', '{}') $$,
  '42501', null, 'worker não grava em outro tenant');
select throws_ok(
  $$ update app.metrica_ativo_diaria set atencao = 10 where id = '3e000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não atualiza: o resultado gravado é a fonte de verdade');
select throws_ok(
  $$ delete from app.metrica_ativo_diaria where id = '3e000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não apaga');

select * from finish();
rollback;
