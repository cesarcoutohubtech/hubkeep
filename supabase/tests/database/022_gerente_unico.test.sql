-- ============================================================================
-- Gerente único no aceite (migração 0027, fase 1a C6; ADR-027). O Gerente do
-- Hotel 1 é o único do hotel, abriu o chamado e executa a OS; decidem o
-- Gestor CSC ou o Admin do grupo (a regra está em corretiva.ts). Aqui, o que o
-- banco garante para isso:
--   1. o Gestor CSC lê as atribuições de Gerente que cobrem os hotéis dele
--      (por hotel e pela bandeira), e não as de hotel fora do escopo dele;
--      segue lendo as de Técnico e não lê as de outros papéis; lê o membro;
--   2. o Gestor CSC e o Admin gravam o aceite da OS e do chamado do Hotel 1;
--      o Gestor de outra bandeira, não;
--   3. o Gerente não lê a atribuição de outro Gerente; o Técnico e o
--      Solicitante não leem as de Gerente;
--   4. outro tenant e sem contexto: nada.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(17);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-unico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-x@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'gestor-y@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'gerente-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'gerente-bandeira-y@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'solicitante@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'gerente@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email)
select '20000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@b.test';
insert into app.bandeira (id, tenant_id, nome) values
  ('ba000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000000', 'Bandeira X'),
  ('ba000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000000', 'Bandeira Y');
insert into app.hotel (id, tenant_id, bandeira_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ba000000-0000-0000-0000-00000000000a', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'ba000000-0000-0000-0000-00000000000b', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, bandeira_id, hotel_id, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'bandeira', 'ba000000-0000-0000-0000-00000000000a', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'gestor_csc', 'bandeira', 'ba000000-0000-0000-0000-00000000000b', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'gerente_hotel', 'hotel', null, '11100000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'gerente_hotel', 'bandeira', 'ba000000-0000-0000-0000-00000000000b', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', null, '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'solicitante', 'hotel', null, '11100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, 'bbbbbbbb-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', null, '22200000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aguardando_aceite', 'chamado_aguardando_aceite', 10, '#0891b2'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'concluida', 'os_concluida', 10, '#16a34a');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10);

-- c1: aberto pelo Gerente único, que também executa a OS (Técnico responsável).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'tomada solta', 'tomada solta', 'aguardando_aceite', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002');
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'concluida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002');

set local role hk_app;

-- Caso 4 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty($$ select 1 from app.atribuicao_escopo $$, 'sem contexto: nenhuma atribuição');

-- Caso 1 — o Gestor CSC da bandeira X (Hotel 1)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'o Gestor CSC lê o Gerente do hotel dele, e não os de hotel fora do escopo');
select set_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'tecnico' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'), ('aaaaaaaa-0000-0000-0000-000000000007') $$,
  'segue lendo as atribuições de Técnico do hotel (0022)');
select is_empty($$ select 1 from app.atribuicao_escopo where papel in ('solicitante', 'admin_grupo') $$,
  'não lê as atribuições de outros papéis');
select isnt_empty($$ select 1 from app.membro where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' and ativo $$,
  'lê se o Gerente é membro ativo');
select is_empty($$ select 1 from app.atribuicao_escopo where tenant_id = '20000000-0000-0000-0000-000000000000' $$,
  'não lê atribuição de outro tenant');

-- Caso 2 — Gerente único que abriu e executa: o Gestor CSC grava o aceite
select isnt_empty($$ update app.os set estado = 'aceita', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'o Gestor CSC aceita a OS do Gerente único');
select isnt_empty($$ update app.chamado set estado = 'concluido', versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$,
  'e leva o chamado junto');

-- Caso 1 e 2 — o Gestor CSC da bandeira Y (Hotel 2)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select set_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000005'), ('aaaaaaaa-0000-0000-0000-000000000006') $$,
  'o Gestor da bandeira Y lê os Gerentes do Hotel 2 (por hotel e pela bandeira)');
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'o Gestor de outra bandeira não altera a OS do Hotel 1');

-- Caso 2 — o Admin do grupo
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select set_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002'), ('aaaaaaaa-0000-0000-0000-000000000005'),
            ('aaaaaaaa-0000-0000-0000-000000000006') $$,
  'o Admin lê todos os Gerentes do grupo');
select isnt_empty($$ update app.os set estado = 'em_execucao', motivo_reabertura = 'Continua solta', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'o Admin reabre a OS do Gerente único');

-- Caso 3 — os outros papéis
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000002') $$,
  'o Gerente único lê só a própria atribuição de Gerente');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select results_eq(
  $$ select usuario_id::text from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000005') $$,
  'o Gerente do Hotel 2 não lê a de outro Gerente');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty($$ select 1 from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  'o Técnico não lê atribuição de Gerente');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ select 1 from app.atribuicao_escopo where papel = 'gerente_hotel' $$,
  'o Solicitante não lê atribuição de Gerente');

-- Caso 4 — outro tenant
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ select 1 from app.atribuicao_escopo where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  'o Gerente do B não lê atribuição do A');

select * from finish();
rollback;
