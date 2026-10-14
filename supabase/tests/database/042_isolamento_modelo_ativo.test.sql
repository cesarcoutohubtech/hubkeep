-- ============================================================================
-- Isolamento de app.modelo_ativo e de app.ativo.modelo_id (migração 0050,
-- fase 1b M1). Os seis casos mínimos do doc 02:
--   1. admin de outro tenant não vê nem grava o modelo do tenant A, nem liga
--      ativo do A a modelo;
--   2. gerente de hotel: o modelo é do grupo (sem hotel_id), então o caso vira
--      "o gerente lê os modelos e não os grava; liga o modelo ao ativo do
--      hotel dele e não ao de outro hotel";
--   3. o proprietário não lê o modelo;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta: a categoria e o checklist do modelo e o modelo do ativo só
--      do próprio tenant; mais a integridade (categoria obrigatória, nome
--      preenchido, campos e plano sugerido como objeto, versão positiva).
-- Mais: o modelo é lido por quem cadastra ativo, inclusive o Técnico (o PWA
-- baixa os modelos para cadastrar offline), e não pelo Solicitante; só o
-- Admin do grupo cria e altera; id e tenant não são alteráveis; sem DELETE; o
-- worker vê só o tenant do job e não grava.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(41);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'implantador-vencido@a.test'),
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
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'uh', 'UH 201', 'uh 201', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'uh', 'UH B', 'uh b', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ar_condicionado'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'ar_condicionado');
insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes) values
  ('cc100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   '{"pt-BR": "Inspeção de ar-condicionado"}'),
  ('ccb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c',
   '{"pt-BR": "Modelo B"}');
-- Modelos: m1 (com checklist e plano sugerido) e m2 (desativado) no tenant A; mb no tenant B.
insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, fabricante, modelo, campos, checklist_modelo_id, plano_sugerido, ativa) values
  ('3a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   'Split 12.000 BTU', 'Fabricante X', 'X-12', '{"btus": 12000}', 'cc100000-0000-0000-0000-000000000001',
   '{"intervalo": 3, "unidade": "mes"}', true),
  ('3a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   'Split antigo', null, null, '{}', null, null, false),
  ('3ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c',
   'Split B', null, null, '{}', 'ccb00000-0000-0000-0000-000000000001', null, true);
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 101', 'split uh 101'),
  ('Q000000002', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 201', 'split uh 201'),
  ('Q000000003', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-00000000000c', 'Split B', 'split b');

-- Caso 6 — FK composta e integridade (como postgres)
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-00000000000c', 'x') $$,
  '23503', null, 'modelo só com categoria do próprio tenant');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, checklist_modelo_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'x',
      'ccb00000-0000-0000-0000-000000000001') $$,
  '23503', null, 'modelo só com checklist do próprio tenant');
select throws_ok(
  $$ update app.ativo set modelo_id = '3ab00000-0000-0000-0000-000000000001'
     where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'o ativo só aponta para modelo do próprio tenant');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'x') $$,
  '23502', null, 'a categoria do modelo é obrigatória');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', '  ') $$,
  '23514', null, 'modelo com nome preenchido');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, campos) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'x', '[]') $$,
  '23514', null, 'os campos do modelo são um objeto');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, plano_sugerido) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'x', '[]') $$,
  '23514', null, 'o plano sugerido é um objeto');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, versao) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'x', 0) $$,
  '23514', null, 'a versão do modelo começa em 1');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.modelo_ativo', 'sem contexto: nenhum modelo');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.modelo_ativo $$,
  $$ values ('3ab00000-0000-0000-0000-000000000001') $$, 'admin B vê só os modelos do B');
select is_empty($$ update app.modelo_ativo set ativa = false
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera modelo do A');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'Intruso') $$,
  '42501', null, 'admin B não cria modelo no A');
select is_empty($$ update app.ativo set modelo_id = null
                   where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não mexe no modelo do ativo do A');

-- Admin do grupo A: lê, cria e altera
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.modelo_ativo $$, $$ values (2) $$,
  'admin A lê os modelos do grupo, inclusive o desativado');
select lives_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome, plano_sugerido) values
     ('3a100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000',
      'ca000000-0000-0000-0000-000000000001', 'Split 9.000 BTU', '{"intervalo": 6, "unidade": "mes"}') $$,
  'admin A cria modelo');
select isnt_empty($$ update app.modelo_ativo set nome = 'Split 9.000 BTU inverter', versao = 2, atualizado_em = now()
                     where id = '3a100000-0000-0000-0000-000000000003' returning 1 $$,
  'admin A altera modelo');

-- Caso 2 — gerente do Hotel 1: lê, não grava o modelo; liga o modelo ao ativo do hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from app.modelo_ativo $$, $$ values (3) $$,
  'gerente lê os modelos do grupo');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'Do gerente') $$,
  '42501', null, 'gerente não cria modelo');
select is_empty($$ update app.modelo_ativo set ativa = false returning 1 $$,
  'gerente não altera modelo');
select isnt_empty($$ update app.ativo set modelo_id = '3a100000-0000-0000-0000-000000000001'
                     where id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente liga o modelo ao ativo do hotel dele');
select is_empty($$ update app.ativo set modelo_id = '3a100000-0000-0000-0000-000000000001'
                   where id = 'a2000000-0000-0000-0000-000000000001' returning 1 $$,
  'gerente não mexe no ativo de outro hotel');

-- Técnico do Hotel 1: lê os modelos (PWA offline), não os grava; cadastra ativo com modelo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq($$ select count(*)::int from app.modelo_ativo $$, $$ values (3) $$,
  'técnico lê os modelos do grupo');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'Do técnico') $$,
  '42501', null, 'técnico não cria modelo');
select is_empty($$ update app.modelo_ativo set ativa = false returning 1 $$,
  'técnico não altera modelo');
select lives_ok(
  $$ insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, modelo_id, nome, busca) values
     ('Q000000004', 'a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000',
      '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'ca000000-0000-0000-0000-000000000001', '3a100000-0000-0000-0000-000000000001', 'Split novo', 'split novo') $$,
  'técnico cadastra ativo com modelo no hotel dele');

-- Caso 3 — proprietário da UH 101 não lê o modelo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.modelo_ativo', 'proprietário não lê os modelos');

-- Solicitante não lê o modelo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select is_empty('select 1 from app.modelo_ativo', 'solicitante não lê os modelos');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty('select 1 from app.modelo_ativo', 'implantador vencido não vê modelo');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'Vencido') $$,
  '42501', null, 'implantador vencido não cria modelo');

-- Colunas imutáveis e sem DELETE (como o admin A, que pode alterar o resto)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select throws_ok($$ update app.modelo_ativo set id = gen_random_uuid() $$,
  '42501', null, 'o id do modelo não é alterável');
select throws_ok($$ update app.modelo_ativo set tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  '42501', null, 'o tenant do modelo não é alterável');
select throws_ok($$ update app.modelo_ativo set criado_em = now() $$,
  '42501', null, 'a criação do modelo não é alterável');
select throws_ok($$ delete from app.modelo_ativo $$, '42501', null, 'sem DELETE em modelo');
select isnt_empty($$ update app.ativo set modelo_id = null
                     where id = 'a1000000-0000-0000-0000-000000000001' returning 1 $$,
  'o modelo do ativo pode ser desligado');
select results_eq(
  $$ select plano_sugerido ->> 'unidade', checklist_modelo_id::text from app.modelo_ativo
     where id = '3a100000-0000-0000-0000-000000000001' $$,
  $$ values ('mes', 'cc100000-0000-0000-0000-000000000001') $$,
  'o modelo guarda a periodicidade sugerida e o checklist');
reset role;

-- Worker: só o tenant do job, sem gravar
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.modelo_ativo', $$ values (1) $$,
  'worker vê só os modelos do tenant do job');
select results_eq('select count(*)::int from app.modelo_ativo', $$ values (3) $$,
  'worker vê todos os modelos do tenant do job');
select results_eq($$ select modelo_id::text from app.ativo where id = 'a1000000-0000-0000-0000-000000000002' $$,
  $$ values ('3a100000-0000-0000-0000-000000000001') $$,
  'worker lê o modelo do ativo');
select throws_ok(
  $$ insert into app.modelo_ativo (id, tenant_id, categoria_id, nome) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001', 'Do worker') $$,
  '42501', null, 'worker não cria modelo');
select throws_ok($$ update app.modelo_ativo set ativa = false $$, '42501', null,
  'worker não altera modelo');
select throws_ok($$ update app.ativo set modelo_id = null $$, '42501', null,
  'worker não altera o modelo do ativo');
reset role;

select * from finish();
rollback;
