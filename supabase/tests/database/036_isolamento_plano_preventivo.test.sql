-- ============================================================================
-- Isolamento de app.plano_preventivo (migração 0045, fase 1b PV2; ADR-041).
-- Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava o plano do tenant A;
--   2. gerente de hotel lê e grava os planos do hotel dele, e não os de outro
--      hotel;
--   3. o proprietário da UH não lê nem grava plano;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: o ativo e a equipe só do próprio hotel; a categoria, o
--      modelo de checklist e o técnico só do próprio tenant; mais a
--      integridade (exatamente um alvo, no máximo um responsável, unidade e
--      situação nas listas do domínio, intervalo e versão positivos, nome
--      preenchido).
-- Mais: o Gestor CSC e o Implantador vigente do hotel também cadastram e
-- alteram (decisão 8), sempre em nome deles mesmos; o Técnico e o
-- Solicitante não leem nem gravam; id, tenant, hotel, alvo e autor não são
-- alteráveis; sem DELETE; o worker vê só o tenant do job e não grava.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(48);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante@a.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'implantador@a.test'),
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
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000000a', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.equipe (id, tenant_id, hotel_id, nome) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Manutenção H1'),
  ('e2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'Manutenção H2');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ar_condicionado'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'ar_condicionado');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 101', 'split uh 101'),
  ('Q000000002', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 201', 'split uh 201'),
  ('Q000000003', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-00000000000c', 'Split B', 'split b');
insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes) values
  ('cc100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   '{"pt-BR": "Inspeção de ar-condicionado"}'),
  ('ccb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Modelo B"}');
-- Planos: p1 (Hotel 1, do ativo, do técnico, ativo), p2 (Hotel 1, da categoria,
-- da equipe, pausado), p3 (Hotel 2), pb (tenant B).
insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, categoria_id, nome, intervalo, unidade, inicio,
                                  checklist_modelo_id, tecnico_id, equipe_id, situacao, criado_por) values
  ('9e100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', null, 'Limpeza do filtro', 1, 'mes', current_date,
   'cc100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'ativo', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('9e100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   null, 'ca000000-0000-0000-0000-000000000001', 'PMOC', 3, 'mes', current_date,
   null, null, 'e1000000-0000-0000-0000-000000000001', 'pausado', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('9e200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001', null, 'Limpeza do filtro H2', 2, 'semana', current_date,
   null, 'aaaaaaaa-0000-0000-0000-000000000007', null, 'ativo', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('9eb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000001', null, 'Plano B', 30, 'dia', current_date,
   null, null, null, 'pausado', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano só aponta para ativo do próprio hotel');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'cb000000-0000-0000-0000-00000000000c', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano só aponta para categoria do próprio tenant');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, checklist_modelo_id, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'ccb00000-0000-0000-0000-000000000001',
      'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano só aponta para modelo de checklist do próprio tenant');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, equipe_id, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'e2000000-0000-0000-0000-000000000001',
      'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano só aponta para equipe do próprio hotel');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, tecnico_id, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'bbbbbbbb-0000-0000-0000-000000000001',
      'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano só aponta para técnico do próprio tenant');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'o plano tem um alvo');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date,
      'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'o plano tem um alvo só: o ativo ou a categoria');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, tecnico_id, equipe_id, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'aaaaaaaa-0000-0000-0000-000000000004',
      'e1000000-0000-0000-0000-000000000001', 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'no máximo um responsável: o técnico ou a equipe');
select throws_ok(
  $$ update app.plano_preventivo set unidade = 'ano' where id = '9e100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a unidade é dia, semana ou mes');
select throws_ok(
  $$ update app.plano_preventivo set situacao = 'cancelado' where id = '9e100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a situação é ativo, pausado ou encerrado');
select throws_ok(
  $$ update app.plano_preventivo set intervalo = 0 where id = '9e100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'o intervalo começa em 1');
select throws_ok(
  $$ update app.plano_preventivo set nome = '   ' where id = '9e100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'o plano tem nome');
select throws_ok(
  $$ update app.plano_preventivo set versao = 0 where id = '9e100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a versão do plano começa em 1');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.plano_preventivo', 'sem contexto: nenhum plano');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.plano_preventivo $$,
  $$ values ('9eb00000-0000-0000-0000-000000000001') $$, 'admin B vê só os planos do B');
select is_empty($$ update app.plano_preventivo set situacao = 'encerrado'
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera plano do A');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'Intruso', 1, 'mes', current_date, 'pausado', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não cria plano no A');

-- Caso 2 — gerente do Hotel 1: lê e grava os planos do hotel dele, e não os de outro
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.plano_preventivo $$, $$ values (2) $$,
  'gerente lê só os planos do hotel dele');
select lives_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     ('9e100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'Inspeção semanal', 1, 'semana', current_date, 'pausado',
      'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente cadastra plano no hotel dele, em nome dele');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não cadastra plano em outro hotel');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não cadastra plano em nome de outro');
select isnt_empty($$ update app.plano_preventivo set situacao = 'pausado', versao = 2, atualizado_em = now()
                     where id = '9e100000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente pausa o plano do hotel dele');
select is_empty($$ update app.plano_preventivo set situacao = 'pausado'
                   where id = '9e200000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente não altera plano de outro hotel');

-- Gestor CSC do Hotel 1: lê e altera os planos do hotel do escopo dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select count(*)::int from app.plano_preventivo $$, $$ values (3) $$,
  'gestor CSC lê os planos do hotel do escopo dele');
select isnt_empty($$ update app.plano_preventivo
                       set situacao = 'ativo', intervalo = 6, unidade = 'mes', inicio = current_date + 1,
                           checklist_modelo_id = 'cc100000-0000-0000-0000-000000000001', equipe_id = null,
                           tecnico_id = 'aaaaaaaa-0000-0000-0000-000000000004', nome = 'PMOC semestral', versao = 2
                     where id = '9e100000-0000-0000-0000-000000000002' returning 1 $$,
  'gestor CSC altera periodicidade, início, checklist, responsável, nome e situação');

-- Técnico do Hotel 1: não lê nem grava plano
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.plano_preventivo', 'técnico não lê plano');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não cadastra plano');
select is_empty($$ update app.plano_preventivo set situacao = 'encerrado' returning 1 $$,
  'técnico não altera plano');

-- Solicitante do Hotel 1: não lê nem grava plano
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.plano_preventivo', 'solicitante não lê plano');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000009') $$,
  '42501', null, 'solicitante não cadastra plano');

-- Implantador vigente do Hotel 1 (decisão 8): lê, cadastra e altera
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-00000000000a', true)) ctx;
select results_eq($$ select count(*)::int from app.plano_preventivo $$, $$ values (3) $$,
  'implantador lê os planos do hotel dele');
select lives_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio,
                                       checklist_modelo_id, tecnico_id, situacao, criado_por) values
     ('9e100000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ca000000-0000-0000-0000-000000000001', 'Pacote da bandeira', 3, 'mes', current_date,
      'cc100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'pausado',
      'aaaaaaaa-0000-0000-0000-00000000000a') $$,
  'implantador cadastra plano por categoria no hotel dele');
select isnt_empty($$ update app.plano_preventivo set nome = 'Pacote da bandeira (revisado)'
                     where id = '9e100000-0000-0000-0000-000000000005' returning 1 $$,
  'implantador altera plano do hotel dele');

-- Caso 3 — proprietário da UH 101: não lê nem grava plano
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.plano_preventivo', 'proprietário não lê plano');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não cadastra plano');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.plano_preventivo', 'implantador vencido não vê plano');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'x', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não cadastra plano');

-- Admin A: lê os planos de todos os hotéis do grupo; escopo, alvo e autor não mudam; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(*)::int from app.plano_preventivo $$, $$ values (5) $$,
  'admin lê os planos de todos os hotéis do grupo');
select throws_ok($$ update app.plano_preventivo set id = gen_random_uuid() $$, '42501', null,
  'o id do plano não é alterável');
select throws_ok($$ update app.plano_preventivo set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do plano não é alterável');
select throws_ok($$ update app.plano_preventivo set hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'o hotel do plano não é alterável');
select throws_ok($$ update app.plano_preventivo set ativo_id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o ativo do plano não é alterável');
select throws_ok($$ update app.plano_preventivo set categoria_id = 'ca000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a categoria do plano não é alterável');
select throws_ok($$ update app.plano_preventivo set criado_por = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, 'quem cadastrou não é alterável');
select throws_ok($$ delete from app.plano_preventivo $$, '42501', null, 'sem DELETE em plano');
reset role;

-- Worker: só o tenant do job, sem gravar
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.plano_preventivo', $$ values (1) $$,
  'worker vê só os planos do tenant do job');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio, situacao, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001', 'Do worker', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'worker não cadastra plano');
select throws_ok($$ update app.plano_preventivo set situacao = 'encerrado' $$, '42501', null,
  'worker não altera plano');
reset role;

select * from finish();
rollback;
