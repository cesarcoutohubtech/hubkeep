-- ============================================================================
-- Aceite da OS por quem abriu o chamado (migração 0026, fase 1a C6; ADR-027):
--   1. admin de outro tenant e quem abriu chamado em outro tenant não alteram
--      a OS nem o chamado do A;
--   2. quem abriu o chamado, com escrita no hotel, altera a OS e o chamado
--      dele (aceite e reabertura), e não os de outro; o Gerente do hotel
--      também; o Solicitante que não abriu, não;
--   3. quem abriu mas perdeu a escrita no hotel (atribuição vencida, ou sem
--      atribuição no hotel do chamado), não;
--   4. sem contexto, nada;
--   5. FK composta: a OS só guarda quem abriu o próprio chamado;
--   6. chamado_aberto_por e aberto_por sem UPDATE; quem abriu não gera OS;
--      o ramo do Técnico responsável (0023) continua;
--   7. motivo_reabertura (o último, na OS): de 1 a 500 caracteres, com UPDATE.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(23);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'abriu@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'outro-solicitante@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'abriu-vencido@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'abriu@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email)
select '20000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@b.test';
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'UTC', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'UTC', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('11120000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'area_comum', 'Lobby H2', 'lobby h2', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'solicitante', 'hotel', '22200000-0000-0000-0000-000000000001', null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aguardando_aceite', 'chamado_aguardando_aceite', 10, '#0891b2'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'concluida', 'os_concluida', 10, '#16a34a'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aguardando_aceite', 'chamado_aguardando_aceite', 10, '#0891b2'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'concluida', 'os_concluida', 10, '#16a34a');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);

-- c1: aberto pelo Solicitante 3; c2: pelo 6 (atribuição vencida); c3: pelo 3,
-- no Hotel 2, onde ele não tem atribuição; cb: pelo Solicitante do B.
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'aguardando_aceite', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'frigobar', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'chuveiro', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);

insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por)
select o.id::uuid, o.tenant::uuid, o.hotel::uuid, o.chamado::uuid, o.local::uuid, o.aberto_por::uuid, 'concluida', o.situacao::uuid,
       o.tecnico::uuid, o.criado_por::uuid
from (values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000006', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as o (id, tenant, hotel, chamado, local, aberto_por, situacao, tecnico, criado_por);

-- Caso 5 — FK composta e colunas sem UPDATE
select throws_ok(
  $$ update app.os set chamado_aberto_por = 'aaaaaaaa-0000-0000-0000-000000000004'
     where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23503', null, 'a OS não guarda outro autor que não o do próprio chamado');
select ok(not has_column_privilege('hk_app', 'app.os', 'chamado_aberto_por', 'UPDATE'),
  'chamado_aberto_por da OS sem UPDATE');
select ok(not has_column_privilege('hk_app', 'app.chamado', 'aberto_por', 'UPDATE'),
  'aberto_por do chamado sem UPDATE');
select lives_ok(
  $$ update app.os set chamado_aberto_por = null where id = '0a200000-0000-0000-0000-000000000001' $$,
  'o nulo (OS preventiva, 1b) passa na FK');
update app.os set chamado_aberto_por = 'aaaaaaaa-0000-0000-0000-000000000003'
 where id = '0a200000-0000-0000-0000-000000000001';

-- Caso 7 — motivo da reabertura
select throws_ok(
  $$ update app.os set motivo_reabertura = '   ' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'motivo de reabertura em branco recusado');
select throws_ok(
  $$ update app.os set motivo_reabertura = repeat('x', 501) where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'motivo de reabertura acima de 500 caracteres recusado');
select ok(has_column_privilege('hk_app', 'app.os', 'motivo_reabertura', 'UPDATE'),
  'motivo_reabertura com UPDATE');

set local role hk_app;

-- Caso 4 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty($$ update app.os set versao = versao + 1 returning 1 $$, 'sem contexto: nenhuma OS alterada');

-- Caso 1 — outro tenant
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select is_empty($$ update app.os set versao = versao + 1
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera OS do A');
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select id::text from app.os $$, $$ values ('0ab00000-0000-0000-0000-000000000001') $$,
  'quem abriu no B só vê a OS do B');
select isnt_empty($$ update app.os set estado = 'aceita', versao = versao + 1
  where id = '0ab00000-0000-0000-0000-000000000001' returning 1 $$, 'quem abriu no B aceita a OS do chamado dele');
select is_empty($$ update app.chamado set versao = versao + 1
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'quem abriu no B não altera chamado do A');

-- Caso 2 — quem abriu o c1, com escrita no Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ update app.os set estado = 'aceita', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'quem abriu aceita a OS do chamado dele');
select isnt_empty($$ update app.chamado set estado = 'concluido', versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'e leva o chamado dele junto');
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$, 'não altera a OS do chamado de outro');
select is_empty($$ update app.chamado set versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000002' returning 1 $$, 'não altera o chamado de outro');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'aaaaaaaa-0000-0000-0000-000000000003', 'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', 'x', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  '42501', null, 'quem abriu não gera OS');

-- Caso 3 — sem escrita no hotel do chamado
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a200000-0000-0000-0000-000000000001' returning 1 $$,
  'quem abriu, sem atribuição no hotel do chamado, não altera a OS');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$,
  'quem abriu, com a atribuição vencida, não altera a OS');
select is_empty($$ update app.chamado set versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000002' returning 1 $$,
  'nem o chamado');

-- Caso 2 — o Solicitante que não abriu e o Gerente do hotel
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty($$ update app.os set versao = versao + 1 returning 1 $$,
  'o Solicitante que não abriu não altera OS');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select isnt_empty($$ update app.os set estado = 'em_execucao', motivo_reabertura = 'Continua pingando', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$,
  'o Gerente do hotel reabre a OS do chamado de outro');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select isnt_empty($$ update app.os set versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000002' returning 1 $$,
  'o Técnico responsável continua alterando a OS dele (0023)');

select * from finish();
rollback;
