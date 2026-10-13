-- ============================================================================
-- Isolamento dos alertas do monitor de SLA e índices da auditoria geral
-- (migração 0044, fase 1c; ADR-043). Os seis casos mínimos do doc 02 para
-- app.sla_alerta:
--   1. admin de outro tenant não vê nem grava;
--   2. a gestão lê: o Admin do grupo, todos os hotéis; o Gerente e o Gestor
--      CSC, só os hotéis deles. Ninguém do hk_app grava, altera ou apaga: o
--      aviso é do worker;
--   3. o proprietário não vê: o aviso é da gestão (o selo da ficha sai dos
--      prazos do chamado);
--   4. o Técnico, o Solicitante e o Implantador do hotel não veem;
--   5. sem contexto, nada;
--   6. FK composta: o aviso só existe no hotel do tenant e para chamado do
--      mesmo hotel.
-- Mais: tipo só na lista do domínio; um aviso por chamado, tipo e prazo, e o
-- prazo refeito ganha o dele; sem UPDATE e sem DELETE para ninguém; o worker
-- grava e vê só o tenant do job; os dois índices da auditoria geral existem.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(30);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'solicitante@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'implantador@a.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@b.test');

insert into app.tenant (id, nome) values
  ('10000000-0000-0000-0000-000000000000', 'Grupo A'),
  ('20000000-0000-0000-0000-000000000000', 'Grupo B');
insert into app.membro (tenant_id, usuario_id, nome, email)
select '10000000-0000-0000-0000-000000000000', id, email, email from auth.users where email like '%@a.test';
insert into app.membro (tenant_id, usuario_id, nome, email) values
  ('20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'Admin B', 'admin@b.test');
insert into app.hotel (id, tenant_id, nome, fuso, status) values
  ('11100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'Hotel 1', 'America/Sao_Paulo', 'ativo'),
  ('11100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'Hotel 2', 'America/Manaus', 'ativo'),
  ('22200000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'Hotel B', 'America/Sao_Paulo', 'ativo');
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'alta', 20, 30),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'alta', 20, 30);
-- c1 (Hotel 1, UH 101), c2 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por, prazo_atendimento, prazo_solucao)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'aberto', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid, '2026-10-14 12:00+00', '2026-10-15 12:00+00'
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'elevador parado', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
-- Avisos: a1 (c1), a2 (c2), ab (cb).
insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo) values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'atendimento_em_risco', '2026-10-14 12:00+00'),
  ('a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'c2000000-0000-0000-0000-000000000001', 'solucao_vencida', '2026-10-15 12:00+00'),
  ('ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'cb000000-0000-0000-0000-000000000001', 'atendimento_vencido', '2026-10-14 12:00+00');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c2000000-0000-0000-0000-000000000001', 'atendimento_vencido', now()) $$,
  '23503', null, 'aviso de chamado de outro hotel');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             'cb000000-0000-0000-0000-000000000001', 'atendimento_vencido', now()) $$,
  '23503', null, 'aviso em hotel de outro tenant');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', 'quase_vencido', now()) $$,
  '23514', null, 'tipo fora da lista do domínio');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', 'atendimento_em_risco', '2026-10-14 12:00+00') $$,
  '23505', null, 'um aviso por chamado, tipo e prazo');
select lives_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', 'atendimento_em_risco', '2026-10-14 15:00+00') $$,
  'o prazo refeito ganha o aviso dele');
select ok(
  not has_any_column_privilege('hk_app', 'app.sla_alerta', 'UPDATE')
  and not has_any_column_privilege('hk_worker', 'app.sla_alerta', 'UPDATE')
  and not has_table_privilege('hk_app', 'app.sla_alerta', 'INSERT')
  and not has_table_privilege('hk_app', 'app.sla_alerta', 'DELETE')
  and not has_table_privilege('hk_worker', 'app.sla_alerta', 'DELETE'),
  'o hk_app só lê; o worker só lê e grava; ninguém altera nem apaga');
select ok(
  not has_column_privilege('hk_worker', 'app.chamado', 'prazo_atendimento', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.chamado', 'prazo_solucao', 'UPDATE')
  and not has_column_privilege('hk_worker', 'app.chamado', 'pausado_segundos', 'UPDATE'),
  'o worker não altera os prazos do chamado (M2; o aceite automático da 0046 só muda estado e situação)');
select is(
  (select pg_get_indexdef(i.indexrelid) from pg_index i
   where i.indexrelid = 'app.auditoria_tenant_em_idx'::regclass),
  'CREATE INDEX auditoria_tenant_em_idx ON app.auditoria USING btree (tenant_id, em DESC, id DESC)',
  'índice da auditoria geral por tenant, na ordem do cursor');
select is(
  (select pg_get_indexdef(i.indexrelid) from pg_index i
   where i.indexrelid = 'app.auditoria_tenant_hotel_em_idx'::regclass),
  'CREATE INDEX auditoria_tenant_hotel_em_idx ON app.auditoria USING btree (tenant_id, hotel_id, em DESC, id DESC)',
  'índice da auditoria geral por hotel, na ordem do cursor');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.sla_alerta', 'sem contexto: nenhum aviso');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.sla_alerta where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê avisos do A');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', 'solucao_em_risco', now()) $$,
  '42501', null, 'admin B não grava aviso no A');

-- Caso 2 — admin A: todos os hotéis do grupo, e não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(*)::int from app.sla_alerta', $$ values (3) $$,
  'admin do grupo vê os avisos de todos os hotéis');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             'c1000000-0000-0000-0000-000000000001', 'solucao_em_risco', now()) $$,
  '42501', null, 'admin do grupo não grava aviso: é do worker');
select throws_ok(
  $$ delete from app.sla_alerta where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'admin do grupo não apaga aviso');

-- Caso 2 — gerente do Hotel 1: só o hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true)) ctx;
select results_eq($$ select count(*)::int from app.sla_alerta where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (2) $$, 'gerente vê os avisos do hotel dele');
select results_eq($$ select count(*)::int from app.sla_alerta where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'gerente do Hotel 1 não vê os do Hotel 2');
select throws_ok(
  $$ update app.sla_alerta set tipo = 'solucao_vencida' where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'gerente não altera aviso');

-- Caso 2 — Gestor CSC do Hotel 2: só o hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select results_eq('select count(*)::int from app.sla_alerta', $$ values (1) $$,
  'Gestor CSC vê só os avisos do hotel dele');

-- Caso 4 — Técnico, Solicitante e Implantador do Hotel 1 não veem
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select is_empty('select 1 from app.sla_alerta', 'técnico não vê aviso');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.sla_alerta', 'solicitante não vê aviso');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select is_empty('select 1 from app.sla_alerta', 'implantador não vê aviso');

-- Caso 3 — proprietário da UH 101 não vê
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty('select 1 from app.sla_alerta', 'proprietário não vê aviso');

reset role;

-- Worker: grava e vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.sla_alerta', $$ values (1) $$,
  'worker vê só o tenant do job');
select results_eq('select count(*)::int from app.sla_alerta', $$ values (3) $$,
  'worker vê os avisos do tenant do job');
select lives_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
             'c2000000-0000-0000-0000-000000000001', 'atendimento_vencido', '2026-10-14 12:00+00') $$,
  'worker grava aviso no tenant do job');
select throws_ok(
  $$ insert into app.sla_alerta (id, tenant_id, hotel_id, chamado_id, tipo, prazo)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             'cb000000-0000-0000-0000-000000000001', 'solucao_em_risco', now()) $$,
  '42501', null, 'worker não grava aviso de outro tenant');
select throws_ok(
  $$ update app.sla_alerta set prazo = now() where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não altera aviso');
select throws_ok(
  $$ delete from app.sla_alerta where id = 'a1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não apaga aviso');
select throws_ok(
  $$ update app.chamado set prazo_solucao = now() where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'worker não altera o chamado');

reset role;

select * from finish();
rollback;
