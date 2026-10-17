-- ============================================================================
-- Isolamento do sinal do hóspede do Intelligence (migração 0052, ADR-047):
-- app.sinal_hospede. Lê, importa e classifica quem decide insight no hotel.
-- Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê, não importa nem classifica;
--   2. gerente de um hotel vê, importa e classifica só no hotel dele; o gestor
--      da bandeira vê os hotéis da bandeira; o técnico e o solicitante do
--      hotel não veem nem importam (o texto do hóspede não vai ao PWA);
--   3. o proprietário não vê nem importa (o Intelligence é gerencial);
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: hotel, categoria e pessoas do mesmo tenant; UH e ativo do
--      mesmo hotel.
-- Mais: o formato da fonte, da nota e da escala e da ligação; a ligação
-- acompanha o ativo; o ativo e a categoria só na reclamação de manutenção; a
-- classificação anda com quem e quando; o texto apagado fica vazio; a mesma
-- avaliação entra uma vez (a reimportação não muda a linha); importar e
-- classificar só em nome próprio; a origem não muda depois de importada;
-- nenhum UPDATE em campo de escopo; sem DELETE; o worker vê só o tenant do
-- job e só apaga o texto.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(54);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-b1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico-h1@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'solicitante-h1@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.bandeira (id, tenant_id, nome) values
  ('11000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira 1');
-- H1 e H2 na Bandeira 1; HB no tenant B.
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-00000000000a', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', null, '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ar_condicionado'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'ar_condicionado');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 101', 'split uh 101'),
  ('Q000000002', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 201', 'split uh 201');
-- s1 no Hotel 1 e s2 no Hotel 2, a classificar; sb no tenant B.
insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, nota, escala, texto, uh_citada, importado_por) values
  ('5a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '1a000000-0000-0000-0000-000000000001', 'google', 'r-1', now() - interval '2 days', 2, 5, 'Ar do 101 muito barulhento', '101',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '1a000000-0000-0000-0000-000000000001', 'google', 'r-2', now() - interval '1 day', 8, 10, 'Chuveiro frio', '201',
   'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '1b000000-0000-0000-0000-000000000001', 'booking', 'r-b', now() - interval '1 day', null, null, 'Do B', null,
   'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'x', now(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'sinal só em hotel do próprio tenant');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'x', now(), 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'quem importa é membro do próprio tenant');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true, ativo_id = 'a2000000-0000-0000-0000-000000000001',
                                  ligacao = 'possivel', classificado_em = now(),
                                  classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'o ativo é do hotel da reclamação');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true, uh_id = '11120000-0000-0000-0000-000000000001',
                                  classificado_em = now(), classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a UH é do hotel da reclamação');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true, categoria_id = 'cb000000-0000-0000-0000-00000000000c',
                                  classificado_em = now(), classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a categoria é do próprio tenant');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true, classificado_em = now(),
                                  classificado_por = 'bbbbbbbb-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'quem classifica é membro do próprio tenant');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'Google Reviews', 'x', now(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a fonte é um código curto');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', '  ', now(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'o código externo é preenchido');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, nota, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'x', now(), 3, 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a nota anda com a escala');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, nota, escala, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'x', now(), 6, 5, 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'a nota não passa da escala');
select throws_ok(
  $$ update app.sinal_hospede set ligacao = 'talvez' where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a ligação é um dos três estados');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true, ativo_id = 'a1000000-0000-0000-0000-000000000001',
                                  classificado_em = now(), classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'com ativo, a ligação é possível ou confirmada');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = false, categoria_id = 'ca000000-0000-0000-0000-000000000001',
                                  classificado_em = now(), classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a categoria só na reclamação de manutenção');
select throws_ok(
  $$ update app.sinal_hospede set manutencao = true where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a classificação anda com quem e quando');
select throws_ok(
  $$ update app.sinal_hospede set texto_apagado_em = now() where id = '5a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'o texto apagado fica vazio');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'r-1', now(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'a mesma avaliação entra uma vez por hotel e fonte');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.sinal_hospede', 'sem contexto: nenhum sinal');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.sinal_hospede $$,
  $$ values ('5ab00000-0000-0000-0000-000000000001') $$, 'admin B vê só os sinais do B');
select is_empty($$ update app.sinal_hospede set manutencao = false, classificado_em = now(),
                                               classificado_por = 'bbbbbbbb-0000-0000-0000-000000000001'
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não classifica sinal do A');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'intruso', now(), 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não importa no A');

-- Admin do grupo A: vê os dois hotéis, importa em nome próprio
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.sinal_hospede $$, $$ values (2) $$,
  'admin A vê os sinais dos hotéis do grupo');
select lives_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, texto, importado_por) values
     ('5a200000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      '1a000000-0000-0000-0000-000000000002', 'pesquisa_interna', 'p-1', now(), 'Elevador parado',
      'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'admin A importa no Hotel 2');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      gen_random_uuid(), 'pesquisa_interna', 'p-2', now(), 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'ninguém importa em nome de outra pessoa');
select is_empty(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, texto, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'r-1', now(), 'Outro texto', 'aaaaaaaa-0000-0000-0000-000000000001')
     on conflict (tenant_id, hotel_id, fonte, id_externo) do nothing returning 1 $$,
  'a reimportação da mesma avaliação não entra');
select results_eq($$ select texto from app.sinal_hospede where id = '5a100000-0000-0000-0000-000000000001' $$,
  $$ values ('Ar do 101 muito barulhento') $$, 'a reimportação não muda a linha que existe');

-- Caso 2 — gerente do Hotel 1: vê, importa e classifica só no hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select id::text from app.sinal_hospede $$,
  $$ values ('5a100000-0000-0000-0000-000000000001') $$, 'gerente vê só o sinal do hotel dele');
select isnt_empty(
  $$ update app.sinal_hospede set manutencao = true, categoria_id = 'ca000000-0000-0000-0000-000000000001',
                                  uh_id = '11110000-0000-0000-0000-000000000001',
                                  ativo_id = 'a1000000-0000-0000-0000-000000000001', ligacao = 'confirmada',
                                  classificado_em = now(), classificado_por = 'aaaaaaaa-0000-0000-0000-000000000002',
                                  versao = 2, atualizado_em = now()
     where id = '5a100000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente classifica e liga ao ativo a reclamação do hotel dele');
select throws_ok(
  $$ update app.sinal_hospede set classificado_por = 'aaaaaaaa-0000-0000-0000-000000000001'
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'ninguém classifica em nome de outra pessoa');
select is_empty($$ update app.sinal_hospede set manutencao = false, classificado_em = now(),
                                               classificado_por = 'aaaaaaaa-0000-0000-0000-000000000002'
                   where id = '5a200000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente não classifica a reclamação de outro hotel');
select lives_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'booking', 'b-1', now(), 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente importa no hotel dele');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
      gen_random_uuid(), 'booking', 'b-2', now(), 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não importa em outro hotel');

-- Gestor CSC da Bandeira 1: vê os hotéis da bandeira
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq($$ select count(*)::int from app.sinal_hospede $$, $$ values (4) $$,
  'gestor da bandeira vê os sinais dos hotéis dela');

-- Técnico e solicitante do Hotel 1: não veem nem importam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.sinal_hospede', 'técnico não vê o sinal do hóspede');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 't-1', now(), 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não importa');
select is_empty($$ update app.sinal_hospede set manutencao = false, classificado_em = now(),
                                               classificado_por = 'aaaaaaaa-0000-0000-0000-000000000004'
                   returning 1 $$,
  'técnico não classifica');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.sinal_hospede', 'solicitante não vê o sinal do hóspede');

-- Caso 3 — proprietário da UH 101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.sinal_hospede', 'proprietário não vê o sinal do hóspede');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'o-1', now(), 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não importa');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.sinal_hospede', 'implantador vencido não vê nada');

-- A origem não muda, nenhum campo de escopo muda e sem DELETE (como o admin A)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ update app.sinal_hospede set texto = 'outro' $$,
  '42501', null, 'o texto não é alterável pelo hk_app');
select throws_ok($$ update app.sinal_hospede set fonte = 'booking' $$,
  '42501', null, 'a fonte não é alterável');
select throws_ok($$ update app.sinal_hospede set ocorrido_em = now() $$,
  '42501', null, 'a data não é alterável');
select throws_ok($$ update app.sinal_hospede set importado_por = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'quem importou não é alterável');
select throws_ok($$ update app.sinal_hospede set texto_apagado_em = now() $$,
  '42501', null, 'o hk_app não apaga o texto');
select throws_ok($$ update app.sinal_hospede set hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  '42501', null, 'o hotel do sinal não é alterável');
select throws_ok($$ update app.sinal_hospede set id = gen_random_uuid() $$,
  '42501', null, 'o id do sinal não é alterável');
select throws_ok($$ update app.sinal_hospede set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do sinal não é alterável');
select throws_ok($$ delete from app.sinal_hospede $$, '42501', null, 'sem DELETE em sinal');
select results_eq(
  $$ select manutencao, ligacao, ativo_id::text from app.sinal_hospede
     where id = '5a100000-0000-0000-0000-000000000001' $$,
  $$ values (true, 'confirmada', 'a1000000-0000-0000-0000-000000000001') $$,
  'a reclamação guarda a classificação e a ligação com o ativo');
reset role;

-- Worker: só o tenant do job, só apaga o texto
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.sinal_hospede', $$ values (1) $$,
  'worker vê só os sinais do tenant do job');
select results_eq('select count(*)::int from app.sinal_hospede', $$ values (4) $$,
  'worker vê todos os sinais do tenant do job');
select isnt_empty(
  $$ update app.sinal_hospede set texto = null, texto_apagado_em = now(), versao = versao + 1, atualizado_em = now()
     where id = '5a200000-0000-0000-0000-000000000001' returning 1 $$,
  'worker apaga o texto vencido');
select throws_ok($$ update app.sinal_hospede set manutencao = false $$, '42501', null,
  'worker não classifica');
select throws_ok(
  $$ insert into app.sinal_hospede (id, tenant_id, hotel_id, lote_id, fonte, id_externo, ocorrido_em, importado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      gen_random_uuid(), 'google', 'w-1', now(), 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'worker não importa');
reset role;

select * from finish();
rollback;
