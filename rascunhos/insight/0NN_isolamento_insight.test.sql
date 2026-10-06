-- ============================================================================
-- RASCUNHO LOCAL: o número do arquivo e o da migração são fixados com o PR.
-- ----------------------------------------------------------------------------
-- Isolamento do insight do Intelligence (migração NNNN, ADR-033): app.insight.
-- Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê, não decide nem grava;
--   2. gerente de um hotel vê e decide só o insight do hotel dele; não vê o de
--      rede que envolve hotel fora do escopo; com acesso a todos os hotéis de
--      um insight de rede, vê, mas não decide (rede é de grupo ou bandeira);
--      gestor da bandeira vê e decide o insight da bandeira, e não o de grupo
--      que envolve hotel de outra bandeira; técnico vê o do hotel e não decide;
--   3. o proprietário não vê insight nenhum e não grava (o Intelligence é
--      gerencial; hoteis_leitura não inclui o proprietário de UH);
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: hotel, bandeira, insight anterior e membro do mesmo tenant.
-- Mais: formato do estado, hotel_ids coerente com o hotel, valor de 0 a 100,
-- um aberto por chave, encerramento em nome próprio, nenhum UPDATE em campo de
-- escopo, sem INSERT pelo hk_app, sem DELETE; o worker vê e grava só o tenant
-- do job e não muda o estado.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(40);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-b1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'gerente-h1-h2@a.test'),
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
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

-- i1: hotel H1. i2: rede da Bandeira 1 (H1 e H2). i3: rede do grupo (H1 e H3).
-- i9: encerrado, mesma chave do i1. ib: tenant B.
insert into app.insight (id, tenant_id, hotel_id, bandeira_id, hotel_ids, tipo, chave, escopo, estado, faixa, valor,
                         versao_score, primeira_deteccao_em, ultima_deteccao_em, encerrado_em, encerrado_por) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-00000000000a', array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo',
   'atencao_ativo|ativoId=x1|hotelId=h1', '{"ativoId": "x1"}', 'novo', 'alta_atencao', 80, 1, now() - interval '2 days', now(), null, null),
  ('e1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null,
   '11000000-0000-0000-0000-00000000000a', array['11100000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000002']::uuid[], 'sistemico',
   'sistemico|falha=ruido|modelo=acme x1|regra=mesmo_modelo', '{"regra": "mesmo_modelo"}', 'novo', 'atencao', null, 1, now() - interval '2 days', now(), null, null),
  ('e1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', null,
   null, array['11100000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000003']::uuid[], 'sistemico',
   'sistemico|falha=vazamento|modelo=acme y2|regra=mesmo_modelo', '{"regra": "mesmo_modelo"}', 'novo', 'atencao', null, 1, now() - interval '2 days', now(), null, null),
  ('e1000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-00000000000a', array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo',
   'atencao_ativo|ativoId=x1|hotelId=h1', '{"ativoId": "x1"}', 'resolvido', 'atencao', 60, 1, now() - interval '90 days',
   now() - interval '60 days', now() - interval '50 days', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('eb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22000000-0000-0000-0000-00000000000a', array['22200000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo',
   'atencao_ativo|ativoId=xb|hotelId=hb', '{"ativoId": "xb"}', 'novo', 'critico', 90, 1, now() - interval '1 day', now(), null, null);

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             array['22200000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6a', '{}', 'atencao', 1, now(), now()) $$,
  '23503', null, 'insight com hotel de outro tenant');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, bandeira_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-00000000000a',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'sistemico', 'k6b', '{}', 'atencao', 1, now(), now()) $$,
  '23503', null, 'insight com bandeira de outro tenant');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em, anterior_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6c', '{}', 'atencao', 1, now(), now(),
             'eb000000-0000-0000-0000-000000000001') $$,
  '23503', null, 'insight anterior de outro tenant');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em, responsavel_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6d', '{}', 'atencao', 1, now(), now(),
             'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'responsável de outro tenant');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000002']::uuid[], 'atencao_ativo', 'k6e', '{}',
             'atencao', 1, now(), now()) $$,
  '23514', null, 'insight de hotel com outro hotel na lista');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{}', 'sistemico', 'k6f', '{}', 'atencao', 1, now(), now()) $$,
  '23514', null, 'insight sem hotel nenhum na lista');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, estado, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6g', '{}', 'aberto', 'atencao', 1, now(), now()) $$,
  '23514', null, 'estado fora dos sete canônicos');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, valor, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6h', '{}', 'atencao', 101, 1, now(), now()) $$,
  '23514', null, 'score acima de 100');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'atencao_ativo|ativoId=x1|hotelId=h1', '{}',
             'atencao', 1, now(), now()) $$,
  '23505', null, 'um insight aberto por chave');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em, encerrado_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k6j', '{}', 'atencao', 1, now(), now(), now()) $$,
  '23514', null, 'encerrado sem quem encerrou');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.insight', 'sem contexto: nenhum insight');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.insight where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê insights do A');
select is_empty($$ update app.insight set estado = 'em_revisao'
  where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não decide insight do A');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             array['11100000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'k1', '{}', 'atencao', 1, now(), now()) $$,
  '42501', null, 'hk_app não cria insight (nasce do job)');

-- Admin do grupo A: vê tudo do tenant e decide o insight de grupo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.insight', $$ values (4) $$, 'admin do grupo vê os quatro insights do A');
select isnt_empty($$ update app.insight set estado = 'em_revisao'
  where id = 'e1000000-0000-0000-0000-000000000003' returning 1 $$, 'admin do grupo decide o insight de grupo');

-- Caso 2 — gestor CSC da Bandeira 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select array_agg(id order by id)::text from app.insight $$,
  $$ values ('{e1000000-0000-0000-0000-000000000001,e1000000-0000-0000-0000-000000000002,e1000000-0000-0000-0000-000000000009}') $$,
  'gestor da bandeira vê os insights dos hotéis dela, e não o de grupo com hotel de outra bandeira');
select isnt_empty($$ update app.insight set estado = 'em_revisao'
  where id = 'e1000000-0000-0000-0000-000000000002' returning 1 $$, 'gestor da bandeira decide o insight da bandeira');
select is_empty($$ update app.insight set estado = 'aceito'
  where id = 'e1000000-0000-0000-0000-000000000003' returning 1 $$, 'gestor da bandeira não decide o de grupo');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select array_agg(id order by id)::text from app.insight $$,
  $$ values ('{e1000000-0000-0000-0000-000000000001,e1000000-0000-0000-0000-000000000009}') $$,
  'gerente vê só os insights do hotel dele, nenhum de rede');
select isnt_empty($$ update app.insight set estado = 'em_revisao'
  where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente decide o insight do hotel dele');
select is_empty($$ update app.insight set estado = 'aceito'
  where id = 'e1000000-0000-0000-0000-000000000002' returning 1 $$, 'gerente não decide insight de rede');
select throws_ok(
  $$ update app.insight set estado = 'resolvido', nota = 'ok', encerrado_em = now(),
       encerrado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'gerente não encerra em nome de outro');
select throws_ok(
  $$ update app.insight set hotel_id = '11100000-0000-0000-0000-000000000002'
     where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'hotel_id não recebe UPDATE');
select throws_ok(
  $$ update app.insight set hotel_ids = array['11100000-0000-0000-0000-000000000001']::uuid[]
     where id = 'e1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'hotel_ids não recebe UPDATE');
select throws_ok(
  $$ update app.insight set valor = 10 where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a pessoa não muda o score (é do job)');
select throws_ok(
  $$ delete from app.insight where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem DELETE');

-- Caso 2 — gerente do Hotel 1 e do Hotel 2: vê o insight da Bandeira 1, mas não decide
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select isnt_empty($$ select 1 from app.insight where id = 'e1000000-0000-0000-0000-000000000002' $$,
  'gerente de todos os hotéis do insight de rede o vê');
select is_empty($$ update app.insight set estado = 'aceito'
  where id = 'e1000000-0000-0000-0000-000000000002' returning 1 $$, 'gerente nunca decide insight de rede');
select is_empty($$ select 1 from app.insight where id = 'e1000000-0000-0000-0000-000000000003' $$,
  'nem vê o de grupo com hotel fora do escopo dele');

-- Caso 2 — técnico do Hotel 1: vê, não decide
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select isnt_empty($$ select 1 from app.insight where id = 'e1000000-0000-0000-0000-000000000001' $$,
  'técnico vê o insight do hotel dele');
select is_empty($$ update app.insight set estado = 'aceito'
  where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'técnico não decide insight');

-- Caso 3 — proprietário da UH 101 (Hotel 1)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.insight', 'proprietário não vê insight');
select is_empty($$ update app.insight set estado = 'aceito'
  where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'proprietário não decide insight');

-- Caso 4 — implantador vencido do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.insight', 'implantador vencido não vê nada');

-- Worker: só o tenant do job; grava detecção, não muda estado
reset role;
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.insight', $$ values (1) $$,
  'worker vê só o tenant do job');
select lives_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, valor, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
             array['11100000-0000-0000-0000-000000000002']::uuid[], 'atencao_ativo', 'atencao_ativo|ativoId=x2|hotelId=h2', '{}',
             'alta_atencao', 75, 1, now(), now()) $$,
  'worker abre insight no tenant do job');
select throws_ok(
  $$ insert into app.insight (id, tenant_id, hotel_id, hotel_ids, tipo, chave, escopo, faixa, versao_score, primeira_deteccao_em, ultima_deteccao_em)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             array['22200000-0000-0000-0000-000000000001']::uuid[], 'atencao_ativo', 'kw', '{}', 'atencao', 1, now(), now()) $$,
  '42501', null, 'worker não grava em outro tenant');
select isnt_empty($$ update app.insight set ultima_deteccao_em = now(), valor = 85, faixa = 'critico'
  where id = 'e1000000-0000-0000-0000-000000000001' returning 1 $$, 'worker atualiza a detecção');
select throws_ok(
  $$ update app.insight set estado = 'resolvido' where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não muda o estado');

select * from finish();
rollback;
