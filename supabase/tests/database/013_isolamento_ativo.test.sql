-- ============================================================================
-- Isolamento de app.ativo (migração 0015, fase 1a B3; ADR-028 e ADR-029): os
-- seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava ativos de outro hotel;
--   3. proprietário vê só os ativos dos locais dele (UH, ou hotel inteiro) e
--      não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta rejeita hotel, local e categoria de outro tenant, e local
--      de outro hotel.
-- Mais: checks de nome, campos e versão; hotel_id não é alterável (ADR-011,
-- meta-teste 18); o UPDATE com versão velha não afeta linha (ADR-029); sem
-- DELETE; worker vê só o tenant do job.
-- Mover (migração 0016, B3c, adendo ao ADR-011): local_id muda só para local
-- do mesmo hotel (a FK recusa outro hotel); o proprietário da UH nova passa a
-- ver o ativo, e o da antiga deixa de ver; o proprietário não move.
-- Código do QR (migração 0018, B5): formato, obrigatório, único no tenant (o
-- mesmo código pode existir em outro), não alterável; a busca pelo código
-- passa pela RLS: outro tenant, outro hotel ou fora da UH do proprietário não
-- acham o ativo.
-- Busca (migração 0019, B6; ADR-030): a coluna é gravada pela aplicação; o
-- ILIKE por trecho passa pela RLS como qualquer leitura, e o worker não grava
-- a busca do ativo.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(42);

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
insert into app.local (id, tenant_id, hotel_id, tipo, nome, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'ativo'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 102', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'ativo'),
  ('11130000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'area_comum', 'Lobby H3', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'ativo');
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
insert into app.categoria_ativo (id, tenant_id, nomes) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '{"pt-BR": "Frigobares"}'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '{"pt-BR": "Categoria B"}');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Frigobar 101'),
  ('Q000000002', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000002', null, 'Ar da 102'),
  ('Q000000003', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', null, 'Elevador H2'),
  ('Q000000004', 'a3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003',
   '11130000-0000-0000-0000-000000000001', null, 'Caldeira H3'),
  ('Q000000005', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'Ativo B');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000006', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      '22210000-0000-0000-0000-000000000001', 'x') $$,
  '23503', null, 'FK rejeita hotel e local de outro tenant');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000007', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11120000-0000-0000-0000-000000000001', 'x') $$,
  '23503', null, 'FK rejeita local de outro hotel');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome) values
     ('Q000000008', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'x') $$,
  '23503', null, 'FK rejeita categoria de outro tenant');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, campos) values
     ('Q000000009', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x', '[]') $$,
  '23514', null, 'campos precisa ser objeto');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000010', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', '   ') $$,
  '23514', null, 'nome não pode ficar vazio');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome, versao) values
     ('Q000000011', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x', 0) $$,
  '23514', null, 'versão começa em 1');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q00000000I', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x') $$,
  '23514', null, 'código QR só com o alfabeto de Crockford em maiúsculas');
select throws_ok(
  $$ insert into app.ativo (id, tenant_id, hotel_id, local_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x') $$,
  '23502', null, 'código QR é obrigatório');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000001', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000002', 'x') $$,
  '23505', null, 'código QR é único no tenant');
select lives_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000003', gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      '22210000-0000-0000-0000-000000000001', 'Outro com o mesmo código') $$,
  'o mesmo código QR pode existir em outro tenant');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.ativo', 'sem contexto: nenhum ativo');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.ativo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê ativos do A');
select is_empty($$ update app.ativo set nome = 'x' where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera ativo do A');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000012', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'admin B não cria ativo no A');
select results_eq($$ select tenant_id from app.ativo where codigo_qr = 'Q000000003' $$,
  $$ values ('20000000-0000-0000-0000-000000000000'::uuid) $$,
  'admin B, pelo código repetido, acha só o ativo do tenant dele');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.ativo order by id $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid), ('a1000000-0000-0000-0000-000000000002'::uuid) $$,
  'gerente vê só os ativos do hotel dele');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000013', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      '11120000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'gerente não cria ativo em outro hotel');
select is_empty($$ update app.ativo set nome = 'x' where hotel_id = '11100000-0000-0000-0000-000000000002' returning 1 $$,
  'gerente não altera ativo de outro hotel');
select is_empty($$ select 1 from app.ativo where codigo_qr = 'Q000000003' $$,
  'gerente não acha pelo código o ativo de outro hotel');
select throws_ok(
  $$ update app.ativo set codigo_qr = 'QZZZZZZZZZ' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'código QR não é alterável');
select lives_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000014', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000002', 'TV da 102') $$,
  'gerente cria ativo no hotel dele');
select throws_ok(
  $$ update app.ativo set hotel_id = '11100000-0000-0000-0000-000000000002'
     where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'hotel_id não é alterável');
select isnt_empty(
  $$ update app.ativo set nome = 'Ar-condicionado 102', versao = versao + 1
     where id = 'a1000000-0000-0000-0000-000000000002' and versao = 1 returning 1 $$,
  'UPDATE com a versão esperada afeta a linha');
select is_empty(
  $$ update app.ativo set nome = 'Ar 102', versao = versao + 1
     where id = 'a1000000-0000-0000-0000-000000000002' and versao = 1 returning 1 $$,
  'UPDATE com versão velha não afeta linha');
select throws_ok(
  $$ update app.ativo set local_id = '11120000-0000-0000-0000-000000000001'
     where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '23503', null, 'mover para local de outro hotel: a FK recusa');
select isnt_empty(
  $$ update app.ativo set local_id = '11110000-0000-0000-0000-000000000001', versao = versao + 1
     where id = 'a1000000-0000-0000-0000-000000000002' and versao = 2 returning 1 $$,
  'gerente move ativo para outro local do hotel dele (UH 102 → UH 101)');

-- Caso 3 — proprietários veem só os ativos dos locais deles e não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select id from app.ativo order by id $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid), ('a1000000-0000-0000-0000-000000000002'::uuid) $$,
  'dono de UH vê só os ativos da UH dele, inclusive o que acabou de ser movido para ela');
select is_empty($$ update app.ativo set nome = 'x' returning 1 $$, 'dono de UH não altera ativo');
select is_empty(
  $$ update app.ativo set local_id = '11110000-0000-0000-0000-000000000002'
     where id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$,
  'dono de UH não move ativo');
select throws_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, nome) values
     ('Q000000015', gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'dono de UH não cria ativo');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select isnt_empty(
  $$ update app.ativo set local_id = '11110000-0000-0000-0000-000000000002', versao = versao + 1
     where id = 'a1000000-0000-0000-0000-000000000002' and versao = 3 returning 1 $$,
  'gerente move o ativo de volta (UH 101 → UH 102)');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select id from app.ativo $$, $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'dono da UH antiga deixa de ver o ativo movido');
select results_eq($$ select id from app.ativo where codigo_qr = 'Q000000001' $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'dono de UH acha pelo código o ativo da UH dele');
select is_empty($$ select 1 from app.ativo where codigo_qr = 'Q000000002' $$,
  'dono de UH não acha pelo código o ativo que saiu da UH dele');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select id from app.ativo $$, $$ values ('a3000000-0000-0000-0000-000000000001'::uuid) $$,
  'dono de hotel inteiro vê só os ativos do hotel dele');
select is_empty($$ update app.ativo set nome = 'x' returning 1 $$, 'dono de hotel inteiro não altera ativo');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.ativo', 'implantador vencido não vê ativo');

-- Admin A: sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ delete from app.ativo $$, '42501', null, 'sem DELETE em ativo');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.ativo', $$ values (1) $$,
  'worker vê só o tenant do job');
select throws_ok($$ update app.ativo set busca = 'x' $$, '42501', null,
  'worker não grava a busca do ativo');
reset role;

-- Busca por trecho (B6): o texto da coluna vem da aplicação; aqui, direto.
update app.ativo set busca = 'frigobar 101' where id = 'a1000000-0000-0000-0000-000000000001';
update app.ativo set busca = 'frigobar h2' where id = 'a2000000-0000-0000-0000-000000000001';
update app.ativo set busca = 'frigobar b' where id = 'ab000000-0000-0000-0000-000000000001';
set local role hk_app;
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.ativo where busca ilike '%rigo%' $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'gerente acha por trecho só os ativos do hotel dele');
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id from app.ativo where busca ilike '%rigo%' $$,
  $$ values ('ab000000-0000-0000-0000-000000000001'::uuid) $$,
  'admin de outro tenant acha por trecho só os ativos do tenant dele');
reset role;

select * from finish();
rollback;
