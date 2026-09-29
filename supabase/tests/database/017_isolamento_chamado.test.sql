-- ============================================================================
-- Isolamento de app.chamado e do anexo de chamado (migração 0021, fase 1a C2;
-- ADR-026, ADR-029, ADR-030): os seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de um hotel não vê nem grava chamado de outro hotel, e só abre
--      em nome dele mesmo;
--   3. proprietário vê o chamado da UH dele (e a foto), ou do hotel inteiro
--      dele, e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta rejeita local, ativo, situação, prioridade e anexo de
--      outro hotel ou tenant.
-- Mais: checks de descrição e política; nenhum UPDATE nesta migração; sem
-- DELETE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(28);

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

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Frigobar não gela', 'frigobar nao gela', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', null,
   'Chuveiro frio', 'chuveiro frio', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', null,
   'Porta do lobby', 'porta do lobby', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', '11130000-0000-0000-0000-000000000001', null,
   'Caldeira com ruído', 'caldeira com ruido', 'aberto', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', null,
   'Chamado B', 'chamado b', 'aberto', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', '{}', 'bbbbbbbb-0000-0000-0000-000000000001');
-- A foto de dois chamados do Hotel 1: o da UH 101 (do dono de UH) e o da UH 102.
insert into app.anexo (id, tenant_id, hotel_id, entidade, chamado_id, caminho, tipo, usuario_id) values
  ('ee000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado', 'c1000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/chamado/c1000000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000011.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('ee000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado', 'c1000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/chamado/c1000000-0000-0000-0000-000000000002/ee000000-0000-0000-0000-000000000012.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'local de outro hotel');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, ativo_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'ativo de outro hotel');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'situação de outro tenant');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'prioridade de outro tenant');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'quem abriu precisa ser membro do tenant');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', '   ', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'descrição em branco');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'política aplicada precisa ser objeto');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23502', null, 'busca é obrigatória, sem default');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, chamado_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'chamado', 'c1000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000002/chamado/c1000000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000099.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'anexo de chamado de outro hotel');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, chamado_id, local_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/chamado/c1000000-0000-0000-0000-000000000001/ee000000-0000-0000-0000-000000000098.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'anexo de chamado só com o chamado_id');
select throws_ok(
  $$ insert into app.anexo (id, tenant_id, hotel_id, entidade, chamado_id, caminho, tipo, usuario_id) values
     ('ee000000-0000-0000-0000-000000000097', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'chamado', 'c1000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000000/11100000-0000-0000-0000-000000000001/chamado/c1000000-0000-0000-0000-000000000002/ee000000-0000-0000-0000-000000000097.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'caminho do anexo precisa ser do chamado');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.chamado', 'sem contexto: nenhum chamado');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.chamado where tenant_id = '10000000-0000-0000-0000-000000000000' $$, $$ values (0) $$,
  'admin B não vê chamados do A');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não abre chamado no A');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.chamado order by id $$,
  $$ values ('c1000000-0000-0000-0000-000000000001'), ('c1000000-0000-0000-0000-000000000002') $$,
  'gerente vê só os chamados do Hotel 1');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não abre chamado em outro hotel');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não abre chamado em nome de outro');
select lives_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002', 'Tomada solta', 'tomada solta', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente abre chamado no Hotel 1');
select throws_ok($$ update app.chamado set descricao = 'x' $$, '42501', null,
  'nenhum UPDATE em chamado nesta migração');
select results_eq($$ select count(*)::int from app.anexo where entidade = 'chamado' $$, $$ values (2) $$,
  'gerente vê as fotos dos chamados do Hotel 1');

-- Caso 3 — proprietários
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select id::text from app.chamado $$,
  $$ values ('c1000000-0000-0000-0000-000000000001') $$, 'dono de UH vê só o chamado da UH dele');
select results_eq($$ select id::text from app.anexo where entidade = 'chamado' $$,
  $$ values ('ee000000-0000-0000-0000-000000000011') $$, 'dono de UH vê só a foto do chamado da UH dele');
select throws_ok(
  $$ insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'x', 'x', 'aberto',
             '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'dono de UH não abre chamado');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select id::text from app.chamado $$,
  $$ values ('c3000000-0000-0000-0000-000000000001') $$, 'dono do hotel inteiro vê os chamados do hotel dele');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.chamado', 'implantador vencido não vê chamado');

-- Admin A: vê todos do tenant; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(*)::int from app.chamado $$, $$ values (5) $$, 'admin vê os chamados do tenant');
select throws_ok($$ delete from app.chamado $$, '42501', null, 'sem DELETE em chamado');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.chamado', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
