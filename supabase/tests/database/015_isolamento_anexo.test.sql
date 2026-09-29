-- ============================================================================
-- Isolamento de app.anexo (migração 0017, fase 1a B4; ajuste do ADR-024): os
-- seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava anexos de outro hotel;
--   3. proprietário vê só os anexos dos locais dele e dos ativos que estão
--      nesses locais (UH, ou hotel inteiro), não vê os anexos do hotel e não
--      grava; o ativo movido leva os anexos junto;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta rejeita local, ativo e usuário de outro hotel ou tenant.
-- Mais: checks de entidade, caminho, miniatura, tipo e remoção; caminho único;
-- a remoção só em nome do usuário do contexto; caminho não é alterável; sem
-- DELETE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-hotel@a.test'),
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
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Hotel 3', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'uh 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('11130000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'area_comum', 'Lobby H3', 'lobby h3', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH'),
  ('11200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Dono do Hotel 3');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.hotel_proprietario (id, tenant_id, proprietario_id, hotel_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000002',
   '11100000-0000-0000-0000-000000000003', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Frigobar 101', 'frigobar 101'),
  ('Q000000002', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', 'Ar da 102', 'ar da 102'),
  ('Q000000003', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'Elevador H2', 'elevador h2'),
  ('Q000000004', 'a3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003',
   '11130000-0000-0000-0000-000000000001', 'Caldeira H3', 'caldeira h3'),
  ('Q000000005', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'Ativo B', 'ativo b');

-- Um anexo por registro. O caminho segue {tenant}/{hotel}/{entidade}/{registro}/{id}.{ext}.
insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, ativo_id, caminho, miniatura_caminho, tipo, usuario_id)
select id::uuid, t::uuid, h::uuid, e, l::uuid, a::uuid,
       t || '/' || h || '/' || e || '/' || coalesce(a, l, h) || '/' || id || '.jpg',
       t || '/' || h || '/' || e || '/' || coalesce(a, l, h) || '/' || id || '-m.webp',
       'image/jpeg', u::uuid
from (values
  ('ee000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local', '11110000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ee000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'ativo', null, 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ee000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'ativo', null, 'a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ee000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'hotel', null, null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ee000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'local', '11120000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'ativo', null, 'a3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('ee000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'hotel', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'ativo', null, 'ab000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) v(id, t, h, e, l, a, u);

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11120000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11120000-0000-0000-0000-000000000001/x.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'FK rejeita local de outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, ativo_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'ativo',
      'a2000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/ativo/a2000000-0000-0000-0000-000000000001/x.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'FK rejeita ativo de outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'hotel',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/hotel/11100000-0000-0000-0000-000000000001/x.jpg',
      'image/jpeg', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'FK rejeita usuário de outro tenant');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, ativo_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/x.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'anexo de local não leva ativo');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000000/22200000-0000-0000-0000-000000000001/ativo/ab000000-0000-0000-0000-000000000001/x.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'caminho de outro tenant é recusado');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000002/x.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'caminho de outro registro é recusado');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, miniatura_caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/y.jpg',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000002/local/11120000-0000-0000-0000-000000000001/y.webp',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'miniatura de outro hotel é recusada');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/z.gif',
      'image/gif', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'tipo fora da lista é recusado');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000001.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', null, 'o mesmo arquivo não é registrado duas vezes');
select throws_ok(
  $$ update app.anexo set removido_em = now() where id = 'ee000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'remoção grava quando e quem, juntos');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.anexo', 'sem contexto: nenhum anexo');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.anexo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê anexos do A');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'hotel',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/hotel/11100000-0000-0000-0000-000000000001/b.jpg',
      'image/jpeg', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não registra anexo no A');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.anexo order by id $$,
  $$ values ('ee000000-0000-0000-0000-000000000001'::uuid), ('ee000000-0000-0000-0000-000000000002'::uuid),
            ('ee000000-0000-0000-0000-000000000003'::uuid), ('ee000000-0000-0000-0000-000000000004'::uuid) $$,
  'gerente vê só os anexos do hotel dele');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'local',
      '11120000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000002/local/11120000-0000-0000-0000-000000000001/g.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não registra anexo em outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000002/g.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não registra anexo em nome de outro usuário');
select lives_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, nome, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000002/g.pdf',
      'application/pdf', 'planta.pdf', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente registra anexo no hotel dele');
select is_empty(
  $$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000002'
     where id = 'ee000000-0000-0000-0000-000000000005' returning 1 $$,
  'gerente não remove anexo de outro hotel');
select throws_ok(
  $$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = 'ee000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'gerente não remove em nome de outro usuário');
select isnt_empty(
  $$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000002'
     where id = 'ee000000-0000-0000-0000-000000000003' returning 1 $$,
  'gerente remove anexo do hotel dele, em nome dele');
select throws_ok(
  $$ update app.anexo set caminho = 'x' where id = 'ee000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'caminho não é alterável');

-- Caso 3 — proprietários
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select id from app.anexo order by id $$,
  $$ values ('ee000000-0000-0000-0000-000000000001'::uuid), ('ee000000-0000-0000-0000-000000000002'::uuid) $$,
  'dono de UH vê os anexos da UH e dos ativos que estão nela, e não os do hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, local_id, caminho, tipo, usuario_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'local',
      '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/local/11110000-0000-0000-0000-000000000001/d.jpg',
      'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'dono de UH não registra anexo');
select is_empty(
  $$ update app.anexo set removido_em = now(), removido_por = 'aaaaaaaa-0000-0000-0000-000000000006' returning 1 $$,
  'dono de UH não remove anexo');
-- O ativo da 102 vai para a 101 (B3c): os anexos dele vão junto.
reset role;
update app.ativo set local_id = '11110000-0000-0000-0000-000000000001' where id = 'a1000000-0000-0000-0000-000000000002';
set local role hk_app;
select results_eq($$ select id from app.anexo where entidade = 'ativo' order by id $$,
  $$ values ('ee000000-0000-0000-0000-000000000002'::uuid), ('ee000000-0000-0000-0000-000000000003'::uuid) $$,
  'o ativo movido para a UH do dono leva os anexos junto');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select id from app.anexo $$, $$ values ('ee000000-0000-0000-0000-000000000006'::uuid) $$,
  'dono de hotel inteiro vê os anexos dos ativos do hotel, e não os do próprio hotel');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.anexo', 'implantador vencido não vê anexo');

-- Admin A: vê tudo do tenant, sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(*)::int from app.anexo $$, $$ values (8) $$, 'admin A vê todos os anexos do tenant');
select throws_ok($$ delete from app.anexo $$, '42501', null, 'sem DELETE em anexo');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.anexo', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
