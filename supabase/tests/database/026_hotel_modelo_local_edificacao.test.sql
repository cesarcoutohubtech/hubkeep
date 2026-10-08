-- ============================================================================
-- Modelo contratual do hotel e edificação do local (migração 0032, fase 1b
-- I2). As colunas são de tabelas que já têm os casos de isolamento no 003;
-- aqui, o que a migração muda:
--   1. o modelo contratual só nos quatro valores canônicos (ou nulo), pelo
--      banco; a edificação de 1 a 60 caracteres (ou nula);
--   2. as duas colunas têm UPDATE para o hk_app, e o worker (conector) não
--      grava nenhuma das duas;
--   3. o modelo contratual: só o Admin do grupo altera (policy de UPDATE do
--      hotel); gerente, implantador vigente e admin de outro tenant, não;
--   4. a edificação: quem escreve no hotel altera, na UH e na área comum;
--      gerente de outro hotel, proprietário, implantador vencido e admin de
--      outro tenant, não. Quem pode editar entre os que escrevem no hotel é
--      regra de ação (podeGerirLocais, no domínio);
--   5. sem contexto, nada.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(31);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'implantador@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
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
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status, cod_externo) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo', 'CM-101'),
  ('11110000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'area_comum', 'Lobby', 'lobby', 'ativo', null),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo', null),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo', null);
insert into app.proprietario (id, tenant_id, nome) values
  ('11200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Dono de UH');
insert into app.local_proprietario (id, tenant_id, proprietario_id, local_id, vigencia_inicio) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11200000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', current_date - 1);
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

-- 1 — formato (como postgres)
select is(
  (select count(*)::int from app.hotel where modelo_contratual is not null),
  0, 'hotel sem modelo informado fica nulo (sem padrão)');
select throws_ok(
  $$ update app.hotel set modelo_contratual = 'franquia' where id = '11100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'modelo contratual fora da lista recusado');
select throws_ok(
  $$ update app.hotel set modelo_contratual = 'Proprio' where id = '11100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'modelo contratual com outra caixa recusado');
select lives_ok(
  $$ update app.hotel set modelo_contratual = 'proprio' where id = '11100000-0000-0000-0000-000000000001' $$,
  'proprio aceito');
select lives_ok(
  $$ update app.hotel set modelo_contratual = 'administrado' where id = '11100000-0000-0000-0000-000000000001' $$,
  'administrado aceito');
select lives_ok(
  $$ update app.hotel set modelo_contratual = 'arrendado' where id = '11100000-0000-0000-0000-000000000001' $$,
  'arrendado aceito');
select lives_ok(
  $$ update app.hotel set modelo_contratual = 'afiliado' where id = '11100000-0000-0000-0000-000000000001' $$,
  'afiliado aceito');
select lives_ok(
  $$ update app.hotel set modelo_contratual = null where id = '11100000-0000-0000-0000-000000000001' $$,
  'nulo aceito (não informado)');
select throws_ok(
  $$ update app.local set edificacao = repeat('x', 61) where id = '11110000-0000-0000-0000-000000000001' $$,
  '23514', null, 'edificação acima de 60 caracteres recusada');
select throws_ok(
  $$ update app.local set edificacao = '' where id = '11110000-0000-0000-0000-000000000001' $$,
  '23514', null, 'edificação vazia recusada (o vazio é nulo)');
select lives_ok(
  $$ update app.local set edificacao = repeat('x', 60) where id = '11110000-0000-0000-0000-000000000001' $$,
  'edificação de 60 caracteres aceita');
select lives_ok(
  $$ update app.local set edificacao = null where id = '11110000-0000-0000-0000-000000000001' $$,
  'edificação nula aceita');

-- 2 — privilégios
select ok(
  has_column_privilege('hk_app', 'app.hotel', 'modelo_contratual', 'UPDATE')
  and has_column_privilege('hk_app', 'app.local', 'edificacao', 'UPDATE'),
  'modelo_contratual e edificacao com UPDATE para o hk_app');
select ok(
  not has_column_privilege('hk_worker', 'app.hotel', 'modelo_contratual', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.local', 'edificacao', 'UPDATE'),
  'o worker (conector) não tem UPDATE em modelo_contratual nem em edificacao');

set local role hk_app;

-- 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty($$ update app.hotel set modelo_contratual = 'proprio' returning 1 $$, 'sem contexto: nenhum hotel alterado');
select is_empty($$ update app.local set edificacao = 'Torre A' returning 1 $$, 'sem contexto: nenhum local alterado');

-- 3 e 4 — admin de outro tenant
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.hotel set modelo_contratual = 'proprio'
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera o modelo de hotel do A');
select is_empty($$ update app.local set edificacao = 'Torre A'
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera a edificação de local do A');

-- 3 — admin do grupo A
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.hotel set modelo_contratual = 'arrendado'
  where id = '11100000-0000-0000-0000-000000000001' returning 1 $$, 'admin do grupo grava o modelo contratual');

-- 3 e 4 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select is_empty($$ update app.hotel set modelo_contratual = 'proprio'
  where id = '11100000-0000-0000-0000-000000000001' returning 1 $$, 'gerente não altera o modelo contratual do hotel dele');
select isnt_empty($$ update app.local set edificacao = 'Torre A'
  where id = '11110000-0000-0000-0000-000000000001' returning 1 $$, 'gerente grava a edificação da UH do sistema hoteleiro');
select isnt_empty($$ update app.local set edificacao = 'Torre B'
  where id = '11110000-0000-0000-0000-000000000002' returning 1 $$, 'gerente grava a edificação da área comum');
select is_empty($$ update app.local set edificacao = 'Torre A'
  where id = '11120000-0000-0000-0000-000000000001' returning 1 $$, 'gerente não altera a edificação de local de outro hotel');
select results_eq(
  $$ select h.modelo_contratual, l.edificacao from app.hotel h
     join app.local l on l.hotel_id = h.id
     where l.id = '11110000-0000-0000-0000-000000000001' $$,
  $$ values ('arrendado'::text, 'Torre A'::text) $$,
  'o gerente lê o modelo e a edificação');

-- 3 — implantador vigente do Hotel 1: grava locais, não o modelo do hotel
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty($$ update app.hotel set modelo_contratual = 'proprio' returning 1 $$, 'implantador vigente não altera o modelo contratual');

-- 4 — proprietário vê a UH dele e não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty($$ update app.local set edificacao = 'Torre Z' returning 1 $$, 'dono de UH não altera a edificação');

-- 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty($$ update app.local set edificacao = 'Torre Z' returning 1 $$, 'implantador vencido não altera a edificação');
reset role;

-- 2 — o worker (promoção de UHs do conector) não grava nenhuma das duas
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok($$ update app.local set edificacao = 'Torre Z' $$, '42501', null, 'worker não grava a edificação');
select throws_ok($$ update app.hotel set modelo_contratual = 'proprio' $$, '42501', null, 'worker não grava o modelo contratual');
select lives_ok($$ update app.local set nome = nome, andar = andar
  where id = '11110000-0000-0000-0000-000000000001' $$, 'worker ainda atualiza nome e andar da UH');
reset role;

select is(
  (select edificacao from app.local where id = '11110000-0000-0000-0000-000000000001'),
  'Torre A', 'a atualização do worker não mexe na edificação');

select * from finish();
rollback;
