-- ============================================================================
-- Isolamento de app.qr_reservado (migração 0061, fase 1b M3). Os seis casos
-- mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava os códigos do tenant A;
--   2. o Gerente de um hotel não vê nem grava códigos de outro hotel;
--   3. o proprietário não lê;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: hotel e membro do próprio tenant; mais a integridade
--      (formato do código, código único no tenant, o mesmo código em outro
--      tenant é outro código).
-- Mais: o Implantador vigente gera códigos para o hotel dele, só em nome
-- próprio; o Técnico lê os códigos do hotel dele (cadastra o ativo da
-- etiqueta); a tabela é só de inserção (sem UPDATE); o worker não lê; ligar a
-- etiqueta é cadastrar o ativo com o código, e a unicidade do código do ativo
-- impede ligar duas vezes.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(24);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
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
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'em_implantacao'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
-- Códigos: r1 no Hotel 1, r2 no Hotel 2, rb no grupo B (com o mesmo código de r1).
insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
  ('9a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'R1R1R1R1R1', '1a100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('9a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'R2R2R2R2R2', '1a100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('9ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'R1R1R1R1R1', '1ab00000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      'X1X1X1X1X1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'o código não aponta para hotel de outro tenant');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'X2X2X2X2X2', gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'quem gera é membro do próprio tenant');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'r1r1r1r1r1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'o código segue o formato do código do ativo');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'R1R1R1R1R1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'o código é único no tenant, mesmo em outro hotel');
-- Ligar a etiqueta: o ativo nasce com o código reservado; uma segunda vez, não.
insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, busca, codigo_qr) values
  ('ab100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'Split', 'split', 'R1R1R1R1R1');
select throws_ok(
  $$ insert into app.ativo (id, tenant_id, hotel_id, local_id, nome, busca, codigo_qr) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', 'Outro', 'outro', 'R1R1R1R1R1') $$,
  '23505', null, 'a etiqueta reservada liga um ativo só');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.qr_reservado', 'sem contexto: nenhum código');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select id::text from app.qr_reservado', $$ values ('9ab00000-0000-0000-0000-000000000001') $$,
  'admin B vê só os códigos do B');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'B1B1B1B1B1', gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não gera código no hotel do A');

-- Admin A: vê os dois hotéis e gera
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.qr_reservado', $$ values (2) $$, 'admin A vê os códigos do A');
select lives_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'A2A2A2A2A2', '1a100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin A gera código para o Hotel 2');
select throws_ok(
  $$ update app.qr_reservado set codigo = 'Z9Z9Z9Z9Z9' where id = '9a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o código reservado não muda');
select throws_ok(
  $$ update app.qr_reservado set lote_id = gen_random_uuid() where id = '9a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o lote do código não muda');

-- Caso 2 — Gerente do Hotel 2: vê e gera só no hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq('select codigo from app.qr_reservado order by codigo', $$ values ('A2A2A2A2A2'), ('R2R2R2R2R2') $$,
  'gerente vê só os códigos do hotel dele');
select lives_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      'G2G2G2G2G2', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente gera código para o hotel dele');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'G1G1G1G1G1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não gera código para outro hotel');

-- Implantador vigente do Hotel 1: gera em nome próprio, não em nome de outro
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select results_eq('select codigo from app.qr_reservado', $$ values ('R1R1R1R1R1') $$,
  'implantador vê os códigos do hotel dele');
select lives_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'K1K1K1K1K1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000005') $$,
  'implantador gera código para o hotel dele');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'J1J1J1J1J1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'implantador não gera código em nome de outra pessoa');

-- Técnico do Hotel 1: lê os códigos do hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq('select count(*)::int from app.qr_reservado', $$ values (2) $$,
  'técnico lê os códigos do hotel dele');
select results_eq(
  $$ select r.codigo from app.qr_reservado r
     where not exists (select 1 from app.ativo a where a.tenant_id = r.tenant_id and a.codigo_qr = r.codigo) $$,
  $$ values ('K1K1K1K1K1') $$, 'o técnico vê qual código ainda está livre');

-- Caso 3 e 4 — proprietário e implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.qr_reservado', 'proprietário não lê os códigos');
select throws_ok(
  $$ insert into app.qr_reservado (id, tenant_id, hotel_id, codigo, lote_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      'P1P1P1P1P1', gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não gera código');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.qr_reservado', 'implantador vencido não lê os códigos');

-- O worker não lê
reset role;
set local role hk_worker;
select throws_ok('select 1 from app.qr_reservado', '42501', null, 'o worker não lê os códigos');

select * from finish();
rollback;
