-- ============================================================================
-- Isolamento da execução da OS (migração 0023, fase 1a C4a; ADR-025,
-- ADR-027): app.os_apontamento, app.os_material, o anexo da OS e o UPDATE do
-- responsável em app.os e app.chamado. Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava;
--   2. o Técnico responsável (ele, ou membro ativo da equipe) aponta, registra
--      e anda com a OS e o chamado; outro técnico do hotel, o de outro hotel,
--      o membro inativo da equipe, o gerente e o solicitante, não;
--   3. (proprietário: sem leitura de apontamento e material; coberto pela
--      policy de leitura do hotel, que ele não tem);
--   4. técnico com a OS cancelada não anda com o chamado;
--   5. sem contexto, nada;
--   6. FK composta rejeita OS e usuário de outro hotel ou tenant.
-- Mais: fim depois do início; material de 1 a 500; anexo da OS; o responsável
-- não entrega a OS a outra pessoa; sem UPDATE nem DELETE nas tabelas novas;
-- worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(37);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'tecnico-equipe@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'tecnico-inativo@a.test'),
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
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.equipe (id, tenant_id, hotel_id, nome) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Manutenção H1');
insert into app.equipe_membro (tenant_id, hotel_id, equipe_id, usuario_id, ativo) values
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', true),
  ('10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006', false);

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'frigobar', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'chuveiro', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'tomada', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
-- o1: do técnico; o2: da equipe; o4: do técnico, cancelada; o3: do Hotel 2; ob: do tenant B.
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, equipe_id, motivo_cancelamento, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', null, 'e1000000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', '11110000-0000-0000-0000-000000000001',
   'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'Trocada', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000007', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'atribuida', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim) values
  ('ab100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', now() - interval '3 hours', now() - interval '2 hours'),
  ('ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '3 hours', now() - interval '2 hours');
insert into app.os_material (id, tenant_id, hotel_id, os_id, usuario_id, descricao) values
  ('ac100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000004', 'Gás R-410A');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', now() - interval '1 hour', now()) $$,
  '23503', null, 'apontamento em OS de outro hotel');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '1 hour', now()) $$,
  '23503', null, 'apontamento de usuário de outro tenant');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', now(), now()) $$,
  '23514', null, 'fim precisa ser depois do início');
select throws_ok(
  $$ insert into app.os_material (id, tenant_id, hotel_id, os_id, usuario_id, descricao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', '   ') $$,
  '23514', null, 'material em branco');
select throws_ok(
  $$ insert into app.os_material (id, tenant_id, hotel_id, os_id, usuario_id, descricao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a200000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', 'x') $$,
  '23503', null, 'material em OS de outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a200000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a200000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000099.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23503', null, 'anexo de OS de outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, chamado_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000098.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'anexo da OS só com o os_id');
select lives_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, os_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000097', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os', '0a100000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/os/0a100000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000097.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'anexo da OS no caminho dela');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.os_apontamento', 'sem contexto: nenhum apontamento');
select is_empty('select 1 from app.os_material', 'sem contexto: nenhum material');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.os_apontamento where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê apontamentos do A');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '1 hour', now()) $$,
  '42501', null, 'admin B não aponta no A');

-- Caso 2 — o Técnico responsável direto (o1)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', now() - interval '1 hour', now()) $$,
  'responsável aponta horas na OS dele');
select lives_ok(
  $$ insert into app.os_material (id, tenant_id, hotel_id, os_id, usuario_id, descricao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000004', 'Fita isolante') $$,
  'responsável registra material na OS dele');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000002',
             'aaaaaaaa-0000-0000-0000-000000000004', now() - interval '1 hour', now()) $$,
  '42501', null, 'técnico fora da equipe não aponta na OS dela');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000005', now() - interval '1 hour', now()) $$,
  '42501', null, 'responsável não aponta em nome de outro');
select isnt_empty($$ update app.os set estado = 'em_execucao', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'responsável inicia a OS dele');
select isnt_empty($$ update app.chamado set estado = 'aguardando_aceite', versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'concluir leva o chamado da OS dele');
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$, 'técnico fora da equipe não anda com a OS dela');
select is_empty($$ update app.chamado set versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000002' returning 1 $$, 'técnico não anda com o chamado de OS de outro');
select throws_ok(
  $$ update app.os set tecnico_id = 'aaaaaaaa-0000-0000-0000-000000000006' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'responsável não entrega a OS a outra pessoa');
select is_empty($$ update app.chamado set versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000004' returning 1 $$, 'com a OS cancelada, o técnico não anda com o chamado');

-- Membro ativo da equipe (o2)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select lives_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000002',
             'aaaaaaaa-0000-0000-0000-000000000005', now() - interval '1 hour', now()) $$,
  'membro da equipe aponta na OS da equipe');
select isnt_empty($$ update app.os set estado = 'em_execucao', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$, 'membro da equipe inicia a OS da equipe');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000005', now() - interval '1 hour', now()) $$,
  '42501', null, 'membro da equipe não aponta na OS de outro técnico');

-- Membro inativo da equipe
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000002',
             'aaaaaaaa-0000-0000-0000-000000000006', now() - interval '1 hour', now()) $$,
  '42501', null, 'membro inativo não aponta na OS da equipe');
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$, 'membro inativo não anda com a OS da equipe');

-- Técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select count(*)::int from app.os_apontamento where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (0) $$, 'técnico do Hotel 2 não vê apontamentos do Hotel 1');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000007', now() - interval '1 hour', now()) $$,
  '42501', null, 'técnico do Hotel 2 não aponta no Hotel 1');

-- Gerente e solicitante do Hotel 1: leem, não apontam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from app.os_apontamento $$, $$ values (3) $$,
  'gerente vê os apontamentos do Hotel 1');
select results_eq($$ select count(*)::int from app.os_material $$, $$ values (2) $$,
  'gerente vê os materiais do Hotel 1');
select throws_ok(
  $$ insert into app.os_apontamento (id, tenant_id, hotel_id, os_id, usuario_id, inicio, fim)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '1 hour', now()) $$,
  '42501', null, 'gerente não aponta horas');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select throws_ok(
  $$ insert into app.os_material (id, tenant_id, hotel_id, os_id, usuario_id, descricao)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000009', 'x') $$,
  '42501', null, 'solicitante não registra material');

-- Admin A: sem UPDATE nem DELETE nas tabelas novas
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ update app.os_apontamento set fim = fim $$, '42501', null, 'sem UPDATE em apontamento');
select throws_ok($$ delete from app.os_apontamento $$, '42501', null, 'sem DELETE em apontamento');
select throws_ok($$ delete from app.os_material $$, '42501', null, 'sem DELETE em material');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.os_apontamento', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
