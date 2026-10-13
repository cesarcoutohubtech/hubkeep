-- ============================================================================
-- Aceite automático pelo worker (migração 0046, fase 1c, M5; ADR-044): o que
-- o hk_worker passa a gravar na OS, no chamado e na transição, e só isso.
--   1. no tenant do job, o worker muda o estado e a situação da OS e do
--      chamado; no outro tenant e sem contexto, o UPDATE não acha linha;
--   2. só as quatro colunas: o responsável, o custo, os códigos, a assinatura
--      e os prazos seguem fora do alcance do worker;
--   3. o worker grava a transição sem usuário, no tenant do job; com usuário,
--      ou em outro tenant, não;
--   4. o check amarra a transição sem usuário ao aceite automático, e só a
--      ele; o hk_app não grava essa ação, nem transição sem usuário.
-- Os casos de isolamento da transição seguem no 025.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(18);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
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
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'UTC', 'ativo');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo'),
  ('22210000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'area_comum', 'Lobby B', 'lobby b', 'ativo');
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aguardando_aceite', 'chamado_aguardando_aceite', 30, '#d97706'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'concluida', 'os_concluida', 30, '#d97706'),
  ('5a000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'chamado', 'concluido', 'chamado_concluido', 40, '#16a34a'),
  ('5a000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000000', 'os', 'aceita', 'os_aceita', 40, '#16a34a'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aguardando_aceite', 'chamado_aguardando_aceite', 30, '#d97706'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'concluida', 'os_concluida', 30, '#d97706');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 e o1 (tenant A), cb e ob (tenant B): OS concluída, chamado aguardando aceite.
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'aguardando_aceite', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'tomada 101', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, criado_por)
select o.id::uuid, o.tenant::uuid, o.hotel::uuid, o.chamado::uuid, o.local::uuid, o.aberto_por::uuid, 'concluida', o.situacao::uuid,
       o.tecnico::uuid, o.aberto_por::uuid
from (values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001')
) as o (id, tenant, hotel, chamado, local, aberto_por, situacao, tecnico);

-- Caso 4 — o check da transição sem usuário (como postgres)
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar', 'concluida', 'aceita', null) $$,
  '23514', null, 'transição sem usuário só no aceite automático');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar_automatico', 'concluida', 'aceita', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'o aceite automático não tem usuário');

-- Caso 2 — só as quatro colunas
select ok(
  has_column_privilege('hk_worker', 'app.os', 'estado', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.os', 'situacao_id', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.os', 'versao', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.os', 'atualizado_em', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.chamado', 'estado', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.chamado', 'situacao_id', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.chamado', 'versao', 'UPDATE')
  and has_column_privilege('hk_worker', 'app.chamado', 'atualizado_em', 'UPDATE'),
  'o worker muda estado, situação, versão e atualizado_em da OS e do chamado');
select ok(
  not has_column_privilege('hk_worker', 'app.os', 'tecnico_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.os', 'equipe_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.os', 'custo_informado', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.os', 'codigo_falha_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.os', 'assinatura_aceite_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.os', 'motivo_reabertura', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.chamado', 'prioridade_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.chamado', 'categoria_id', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.chamado', 'impacto_hospede', 'UPDATE'),
  'o worker não muda responsável, custo, códigos, assinatura, reabertura, prioridade, categoria nem impacto');

set local role hk_worker;

-- Caso 1 — sem contexto, o UPDATE não acha linha
select from (select set_config('app.tenant_id', '', true)) ctx;
select results_eq(
  $$ with u as (update app.os set estado = 'aceita' where id = '0a100000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'sem contexto, o worker não muda OS');

-- Caso 1 — no tenant do job, muda; no outro, não acha linha
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ with u as (update app.os set estado = 'aceita', situacao_id = '5a000000-0000-0000-0000-000000000004', versao = versao + 1,
                  atualizado_em = now()
                where id = '0a100000-0000-0000-0000-000000000001' and versao = 1 returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$, 'o worker aceita a OS do tenant do job');
select results_eq(
  $$ with u as (update app.chamado set estado = 'concluido', situacao_id = '5a000000-0000-0000-0000-000000000003', versao = versao + 1,
                  atualizado_em = now()
                where id = 'c1000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$, 'o worker reflete o aceite no chamado do tenant do job');
select results_eq(
  $$ with u as (update app.os set estado = 'aceita' where id = '0ab00000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'o worker não muda OS de outro tenant');
select results_eq(
  $$ with u as (update app.chamado set estado = 'concluido' where id = 'cb000000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'o worker não muda chamado de outro tenant');

-- Caso 2 — fora das quatro colunas, sem privilégio
select throws_ok(
  $$ update app.os set tecnico_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o worker não troca o responsável da OS');
select throws_ok(
  $$ update app.chamado set prazo_solucao = now() where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'o worker não mexe no prazo do chamado');

-- Caso 3 — a transição sem usuário, no tenant do job
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar_automatico', 'concluida', 'aceita') $$,
  'o worker grava a transição do aceite automático');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar', 'concluida', 'aceita', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'o worker não grava transição em nome de alguém');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '0ab00000-0000-0000-0000-000000000001',
             'aceitar_automatico', 'concluida', 'aceita') $$,
  '42501', null, 'o worker não grava transição de outro tenant');
reset role;

-- Caso 4 — o hk_app não grava o aceite automático
set local role hk_app;
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
                    set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar_automatico', 'concluida', 'aceita', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'o gerente não grava aceite automático, nem em nome dele');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'aceitar_automatico', 'concluida', 'aceita') $$,
  '42501', null, 'o hk_app não grava transição sem usuário');
reset role;

-- O que ficou gravado (como postgres)
select results_eq(
  $$ select acao, usuario_id from app.os_transicao where os_id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values ('aceitar_automatico'::text, null::uuid) $$,
  'uma transição, do aceite automático, sem usuário');
select results_eq(
  $$ select estado from app.os where id = '0ab00000-0000-0000-0000-000000000001' $$,
  $$ values ('concluida'::text) $$,
  'a OS do outro tenant segue concluída');

select * from finish();
rollback;
