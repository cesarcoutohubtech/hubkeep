-- ============================================================================
-- Leitura de app.auditoria pelo proprietário (migração 0028, fase 1a D1): o
-- proprietário lê as linhas do local, do ativo, do chamado e da OS que ele
-- vê, e nada mais (a da parada continua fora: decisão de 30/09/2026, C5). Os casos do doc 02 para a policy alterada:
--   1. admin de outro tenant não lê;
--   2. gerente lê a auditoria do hotel dele, como antes, e não a de outro;
--   3. dono de UH lê só a do que está na UH dele (não a do hotel, nem a da
--      UH vizinha); o ativo que saiu da UH sai do histórico dele; dono do
--      hotel inteiro lê a do hotel dele, menos a do próprio hotel; vínculo
--      vencido não lê nada; proprietário não grava auditoria;
--   4. implantador vencido não lê;
--   5. sem contexto, nada;
--   6. sem UPDATE nem DELETE.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'dono-vencido@a.test'),
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
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Hotel 3', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'uh 102', 'ativo'),
  ('11130000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'area_comum', 'Lobby H3', 'lobby h3', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 3'),
  ('11200000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Dono vencido');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio, vigencia_fim) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1, null),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000003',
   '11110000-0000-0000-0000-000000000002', current_date - 30, current_date - 1);
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000003', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000003', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar 101', 'frigobar 101'),
  ('Q000000002', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', 'Ar da 102', 'ar da 102');
insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Frigobar não gela', 'frigobar nao gela', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', null,
   'Chuveiro frio', 'chuveiro frio', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', '11130000-0000-0000-0000-000000000001', null,
   'Caldeira com ruído', 'caldeira com ruido', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, equipe_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000002');
insert into app.parada_ativo (id, tenant_id, hotel_id, ativo_id, chamado_id, os_id, inicio, aberta_por) values
  ('fa100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', null, now() - interval '5 hours', 'aaaaaaaa-0000-0000-0000-000000000002');

-- Uma linha de auditoria por registro, e as que o proprietário não pode ler:
-- a do hotel (configuração, ativação) e a do grupo (sem hotel).
insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, depois, usuario_id) values
  ('ad000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'hotel',        '11100000-0000-0000-0000-000000000001', 'configurar', '{"fuso":"UTC"}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',        '11110000-0000-0000-0000-000000000001', 'alterar', '{"andar":"1"}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',        '11110000-0000-0000-0000-000000000002', 'alterar', '{"andar":"1"}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'ativo',        'a1000000-0000-0000-0000-000000000001', 'criar', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'ativo',        'a1000000-0000-0000-0000-000000000002', 'criar', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado',      'c1000000-0000-0000-0000-000000000001', 'abrir', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado',      'c1000000-0000-0000-0000-000000000002', 'abrir', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os',           '0a100000-0000-0000-0000-000000000001', 'gerar', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'os',           '0a100000-0000-0000-0000-000000000002', 'gerar', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'parada_ativo', 'fa100000-0000-0000-0000-000000000001', 'registrar', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ad000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'hotel',        '11100000-0000-0000-0000-000000000003', 'ativar', '{"status":"ativo"}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'local',        '11130000-0000-0000-0000-000000000001', 'criar', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'chamado',      'c3000000-0000-0000-0000-000000000001', 'abrir', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000000', null,                                   'membro',       'aaaaaaaa-0000-0000-0000-000000000006', 'convidar', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ad000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'local',        '22210000-0000-0000-0000-000000000001', 'criar', '{}', 'bbbbbbbb-0000-0000-0000-000000000001');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.auditoria', 'sem contexto: nenhuma auditoria');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.auditoria $$,
  $$ values ('ad000000-0000-0000-0000-000000000099') $$, 'admin B lê só a auditoria do B');

-- Caso 2 — gerente do Hotel 1: como antes, tudo do hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.auditoria $$, $$ values (10) $$,
  'gerente lê a auditoria do Hotel 1, a do hotel inclusive');
select is_empty($$ select 1 from app.auditoria where hotel_id is distinct from '11100000-0000-0000-0000-000000000001' $$,
  'gerente não lê a do Hotel 3 nem a do grupo');

-- Caso 3 — dono de UH: o local, o ativo, o chamado e a OS da UH 101; a parada, não
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select id::text from app.auditoria order by id $$,
  $$ values ('ad000000-0000-0000-0000-000000000002'), ('ad000000-0000-0000-0000-000000000004'),
            ('ad000000-0000-0000-0000-000000000006'), ('ad000000-0000-0000-0000-000000000008') $,
  'dono de UH lê só a auditoria do que está na UH dele (não a do hotel, a da parada nem a da UH 102)');
select throws_ok(
  $$ insert into app.auditoria (id, tenant_id, hotel_id, entidade, registro_id, acao, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001', 'alterar', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'dono de UH não grava auditoria');

-- O frigobar sai da UH 101: o histórico dele sai junto.
reset role;
update app.ativo set local_id = '11110000-0000-0000-0000-000000000002' where id = 'a1000000-0000-0000-0000-000000000001';
set local role hk_app;
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ select 1 from app.auditoria where entidade = 'ativo' $$,
  'o ativo que saiu da UH sai do histórico do dono');
select results_eq($$ select count(*)::int from app.auditoria where entidade = 'chamado' $$, $$ values (1) $$,
  'o chamado da UH continua no histórico do dono');

-- Dono do hotel inteiro: o local e o chamado do Hotel 3, não a do hotel
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select id::text from app.auditoria order by id $$,
  $$ values ('ad000000-0000-0000-0000-000000000012'), ('ad000000-0000-0000-0000-000000000013') $$,
  'dono do hotel inteiro lê a do local e do chamado, não a do hotel');

-- Vínculo vencido: nada
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.auditoria', 'dono com vínculo vencido não lê auditoria');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.auditoria', 'implantador vencido não lê auditoria');

-- Caso 6 — sem UPDATE nem DELETE (admin A)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ update app.auditoria set acao = 'x' $$, '42501', null, 'sem UPDATE em auditoria');
select throws_ok($$ delete from app.auditoria $$, '42501', null, 'sem DELETE em auditoria');
reset role;

select * from finish();
rollback;
