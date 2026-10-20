-- ============================================================================
-- Isolamento de app.plano_padrao e das colunas novas do pacote da bandeira
-- (bandeira_id nos modelos de ativo e de checklist, plano_padrao_id no plano
-- do hotel; migração 0059, fase 1b PB1). Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava o pacote do tenant A;
--   2. quem gere o hotel (Gestor CSC da bandeira, Gerente) lê o pacote e não
--      grava; o plano copiado do pacote só entra no hotel de quem copia;
--   3. o proprietário não lê o pacote;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: bandeira, categoria e checklist do plano do pacote, a
--      bandeira dos modelos e a origem do plano do hotel são do próprio
--      tenant; mais a integridade (periodicidade válida, um plano copiado de
--      cada plano do pacote por hotel).
-- Mais: o Implantador vigente lê o pacote e copia o plano para o hotel dele;
-- o Técnico não lê; ninguém muda a bandeira dos modelos nem a origem do plano
-- copiado; o worker não lê o pacote.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira X'),
  ('22000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000000', 'Bandeira Y');
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000',
   '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'em_implantacao'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null, 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo
  (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, proprietario_id, valido_ate, concedido_por)
values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', '11000000-0000-0000-0000-00000000000a', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'refrigeracao'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'refrigeracao');
insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes, bandeira_id) values
  ('cc100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   '{"pt-BR": "Inspeção de ar-condicionado"}', '11000000-0000-0000-0000-00000000000a'),
  ('ccb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c',
   '{"pt-BR": "Inspeção B"}', null);
insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, bandeira_id) values
  ('a0a10000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   'Split 12k da bandeira X', '11000000-0000-0000-0000-00000000000a');
-- Planos do pacote: p1 da bandeira X, p2 do grupo A inteiro, pb do grupo B.
insert into app.plano_padrao (id, tenant_id, bandeira_id, categoria_id, nome, intervalo, unidade, checklist_modelo_id) values
  ('bd100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a',
   'ca000000-0000-0000-0000-000000000001', 'Limpeza de filtros', 1, 'mes', 'cc100000-0000-0000-0000-000000000001'),
  ('bd100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null,
   'ca000000-0000-0000-0000-000000000001', 'Revisão anual', 1, 'mes', null),
  ('bdb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null,
   'cb000000-0000-0000-0000-00000000000c', 'Plano B', 2, 'semana', null);

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, bandeira_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-00000000000b',
      'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes') $$,
  '23503', null, 'o plano do pacote não aponta para bandeira de outro tenant');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c', 'X', 1, 'mes') $$,
  '23503', null, 'o plano do pacote não aponta para categoria de outro tenant');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade, checklist_modelo_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes',
      'ccb00000-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano do pacote não aponta para checklist de outro tenant');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, bandeira_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X',
      '22000000-0000-0000-0000-00000000000b') $$,
  '23503', null, 'o modelo de ativo não aponta para bandeira de outro tenant');
select throws_ok(
  $$ insert into app.checklist_modelo (id, tenant_id, nomes, bandeira_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "X"}', '22000000-0000-0000-0000-00000000000b') $$,
  '23503', null, 'o modelo de checklist não aponta para bandeira de outro tenant');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X', 1, 'ano') $$,
  '23514', null, 'a unidade do plano do pacote é dia, semana ou mês');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X', 0, 'mes') $$,
  '23514', null, 'o intervalo do plano do pacote é a partir de 1');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por, plano_padrao_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001',
      'bdb00000-0000-0000-0000-000000000001') $$,
  '23503', null, 'o plano do hotel não é copiado de plano do pacote de outro tenant');
insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por, plano_padrao_id) values
  ('ee200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'ca000000-0000-0000-0000-000000000001', 'Revisão anual', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001',
   'bd100000-0000-0000-0000-000000000002');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por, plano_padrao_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'ca000000-0000-0000-0000-000000000001', 'De novo', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000001',
      'bd100000-0000-0000-0000-000000000002') $$,
  '23505', null, 'um plano copiado de cada plano do pacote por hotel');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.plano_padrao', 'sem contexto: nenhum plano do pacote');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select id::text from app.plano_padrao', $$ values ('bdb00000-0000-0000-0000-000000000001') $$,
  'admin B vê só o pacote do B');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes') $$,
  '42501', null, 'admin B não grava no pacote do A');

-- Admin A: lê e grava o pacote; a bandeira não muda
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.plano_padrao', $$ values (2) $$, 'admin A vê o pacote do A');
select lives_ok(
  $$ insert into app.plano_padrao (id, tenant_id, bandeira_id, categoria_id, nome, intervalo, unidade) values
     ('bd100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a',
      'ca000000-0000-0000-0000-000000000001', 'Novo do pacote', 3, 'semana') $$,
  'admin A cria plano do pacote');
select results_eq(
  $$ with u as (update app.plano_padrao set nome = 'Limpeza mensal', versao = versao + 1, atualizado_em = now()
       where id = 'bd100000-0000-0000-0000-000000000001' returning versao) select versao from u $$,
  $$ values (2) $$, 'admin A altera o plano do pacote');
select throws_ok(
  $$ update app.plano_padrao set bandeira_id = null where id = 'bd100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a bandeira do plano do pacote não muda');
select throws_ok(
  $$ update app.modelo_ativo set bandeira_id = null where id = 'a0a10000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a bandeira do modelo de ativo não muda');
select throws_ok(
  $$ update app.checklist_modelo set bandeira_id = null where id = 'cc100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a bandeira do modelo de checklist não muda');

-- Caso 2 — Gestor CSC da bandeira X e Gerente do Hotel 1: leem, não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq('select count(*)::int from app.plano_padrao', $$ values (3) $$, 'gestor CSC lê o pacote');
select throws_ok(
  $$ insert into app.plano_padrao (id, tenant_id, categoria_id, nome, intervalo, unidade) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes') $$,
  '42501', null, 'gestor CSC não grava no pacote');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq('select count(*)::int from app.plano_padrao', $$ values (3) $$, 'gerente lê o pacote');
select results_eq(
  $$ with u as (update app.plano_padrao set nome = 'Do gerente' returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'gerente não altera o pacote');

-- Implantador vigente do Hotel 1: lê o pacote e copia o plano para o hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select results_eq('select count(*)::int from app.plano_padrao', $$ values (3) $$, 'implantador lê o pacote');
select lives_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por, plano_padrao_id) values
     ('ee100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'ca000000-0000-0000-0000-000000000001', 'Limpeza mensal', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000005',
      'bd100000-0000-0000-0000-000000000001') $$,
  'implantador copia o plano do pacote para o hotel dele');
select throws_ok(
  $$ insert into app.plano_preventivo (id, tenant_id, hotel_id, categoria_id, nome, intervalo, unidade, inicio, situacao, criado_por, plano_padrao_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'ca000000-0000-0000-0000-000000000001', 'X', 1, 'mes', current_date, 'pausado', 'aaaaaaaa-0000-0000-0000-000000000005',
      'bd100000-0000-0000-0000-000000000003') $$,
  '42501', null, 'implantador não copia o plano para outro hotel');
select throws_ok(
  $$ update app.plano_preventivo set plano_padrao_id = null where id = 'ee100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a origem do plano copiado não muda');

-- Técnico, proprietário e implantador vencido: não leem o pacote
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.plano_padrao', 'técnico não lê o pacote');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.plano_padrao', 'proprietário não lê o pacote');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.plano_padrao', 'implantador vencido não lê o pacote');

-- O worker não lê o pacote
reset role;
set local role hk_worker;
select throws_ok('select 1 from app.plano_padrao', '42501', null, 'o worker não lê o pacote');

select * from finish();
rollback;
