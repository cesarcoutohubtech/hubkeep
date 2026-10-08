-- ============================================================================
-- Isolamento das transições da OS (migração 0031, fase 1b I5):
-- app.os_transicao. Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava;
--   2. quem tem escrita no hotel grava a transição de uma OS do hotel, em nome
--      dele mesmo, e não em nome de outro;
--   3. o proprietário da UH vê as transições das OS da UH dele, e só elas;
--      não grava;
--   4. técnico de outro hotel não vê nem grava;
--   5. sem contexto, nada;
--   6. FK composta: a transição só existe na OS do mesmo hotel e com usuário
--      do tenant.
-- E o implantador vencido do Hotel 1, que não vê nem grava (B2 do docs/11).
-- Mais: formato de acao, de e para; sem UPDATE e sem DELETE para ninguém;
-- worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(29);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
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
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'uh 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono da UH 101');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (UH 101, do proprietário), c2 (UH 102), c5 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'tomada 101', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'tomada 102', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por)
select o.id::uuid, o.tenant::uuid, o.hotel::uuid, o.chamado::uuid, o.local::uuid, o.aberto_por::uuid, 'em_execucao', o.situacao::uuid,
       o.tecnico::uuid, o.aberto_por::uuid
from (values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001')
) as o (id, tenant, hotel, chamado, local, aberto_por, situacao, tecnico);
-- t1 (OS da UH 101), t2 (UH 102), t5 (Hotel 2), tb (tenant B): a geração de cada OS.
insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, quando, usuario_id) values
  ('7a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
   'gerar', null, 'atribuida', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('7a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000002',
   'gerar', null, 'atribuida', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('7a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '0a200000-0000-0000-0000-000000000001',
   'gerar', null, 'atribuida', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('7ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '0ab00000-0000-0000-0000-000000000001',
   'gerar', null, 'atribuida', now() - interval '2 hours', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e formato (como postgres)
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', 'em_execucao', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23503', null, 'transição com OS de outro hotel');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', 'em_execucao', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'transição com usuário de outro tenant');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', 'em_execucao', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'transição com hotel de outro tenant');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'Iniciar!', 'atribuida', 'em_execucao', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'ação fora do formato');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'Atribuída', 'em_execucao', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'estado de antes fora do formato');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', '', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'estado de depois fora do formato');
select ok(not has_any_column_privilege('hk_app', 'app.os_transicao', 'UPDATE')
          and not has_any_column_privilege('hk_worker', 'app.os_transicao', 'UPDATE'),
  'sem UPDATE em transição para o hk_app e o hk_worker');
select ok(not has_table_privilege('hk_worker', 'app.os_transicao', 'INSERT'),
  'worker não grava transição');

set local role hk_app;

-- Caso 5 — sem contexto, nada
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.os_transicao', 'sem contexto, nenhuma transição');

-- Caso 1 — admin B não vê nem grava no tenant A
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.os_transicao', $$ values (1) $$,
  'admin B vê só a transição do tenant B');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', 'em_execucao', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não grava transição no tenant A');

-- Caso 2 — técnico do Hotel 1 grava em nome dele, não em nome de outro
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.os_transicao where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (2) $$, 'técnico do Hotel 1 vê as transições das OS do hotel');
select is_empty($$ select 1 from app.os_transicao where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  'técnico do Hotel 1 não vê transição do Hotel 2');
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values ('7a100000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'iniciar', 'atribuida', 'em_execucao', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'técnico do Hotel 1 grava a transição em nome dele');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'técnico não grava transição em nome de outro');
select throws_ok($$ update app.os_transicao set para = 'pausada'
  where id = '7a100000-0000-0000-0000-000000000011' $$,
  '42501', null, 'técnico não altera a transição gravada (sem UPDATE)');
select throws_ok($$ delete from app.os_transicao $$, '42501', null, 'sem DELETE em transição');

-- Gerente do Hotel 1: grava em nome dele, não no Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000002',
             'reatribuir', 'atribuida', 'atribuida', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente do Hotel 1 grava a transição em nome dele');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '0a200000-0000-0000-0000-000000000001',
             'cancelar', 'em_execucao', 'cancelada', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente do Hotel 1 não grava transição no Hotel 2');

-- Caso 4 — técnico do Hotel 2 não vê nem grava no Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ select 1 from app.os_transicao where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'técnico do Hotel 2 não vê transição do Hotel 1');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'aaaaaaaa-0000-0000-0000-000000000007') $$,
  '42501', null, 'técnico do Hotel 2 não grava transição no Hotel 1');

-- Implantador vencido do Hotel 1 (B2): não vê nem grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.os_transicao', 'implantador vencido não vê transição');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não grava transição');

-- Caso 3 — proprietário da UH 101: vê as transições da OS da UH dele, só elas
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select count(*)::int from app.os_transicao where os_id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values (2) $$, 'proprietário da UH vê as transições da OS da UH dele');
select is_empty($$ select 1 from app.os_transicao where os_id <> '0a100000-0000-0000-0000-000000000001' $$,
  'proprietário da UH não vê transição de OS de outra UH nem de outro hotel');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não grava transição');

-- Admin A: vê tudo do tenant
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(distinct hotel_id)::int from app.os_transicao $$, $$ values (2) $$,
  'admin A vê as transições dos dois hotéis do tenant');
select results_eq($$ select count(*)::int from app.os_transicao where tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin A não vê transição do tenant B');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.os_transicao', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
