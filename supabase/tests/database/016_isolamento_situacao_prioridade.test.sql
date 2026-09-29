-- ============================================================================
-- Isolamento de app.situacao e app.prioridade (migração 0020, fase 1a C1;
-- ADR-027): os seis casos mínimos do doc 02, nas duas tabelas.
--   1. admin de outro tenant não vê nem grava;
--   2. gerente de hotel: as tabelas não têm hotel_id (são do tenant), então o
--      caso vira "lê as do tenant e não grava";
--   3. proprietário (de UH e de hotel inteiro sem locais) lê e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK: as tabelas só referenciam o tenant; o caso vira integridade: uma
--      linha padrão por chave e tenant, entidade, formato do estado, ordem,
--      cor e peso.
-- Mais: só o Admin grava; entidade, estado e chave_padrao não são alteráveis;
-- sem DELETE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(35);

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
  ('11100000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000000', 'Hotel 3', 'UTC', 'em_implantacao');
insert into app.local (id, tenant_id, hotel_id, tipo, nome, busca, status) values
  ('11110000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'uh', 'UH 101', 'uh 101', 'ativo');
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
insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, nomes, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', '{}', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', null, '{"pt-BR": "Aguardando peça"}', 35, '#d97706'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', null, '{"pt-BR": "Situação B"}', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, nomes, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'urgente', '{}', 10, 100),
  ('9a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Crítica"}', 5, 200),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Prioridade B"}', 10, 50);

-- Caso 6 — integridade (como postgres)
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 1, '#000000') $$,
  '23505', null, 'situação padrão entra uma vez por tenant');
select lives_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
     (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 1, '#000000') $$,
  'a mesma situação padrão em outro tenant');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'preventiva', 'aberto', 1, '#000000') $$,
  '23514', null, 'entidade só chamado ou os');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'Em Execução', 1, '#000000') $$,
  '23514', null, 'estado fora do formato');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'pausada', 0, '#000000') $$,
  '23514', null, 'ordem de 1 a 999');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'pausada', 1, '#FFF') $$,
  '23514', null, 'cor em #rrggbb minúsculo');
select throws_ok(
  $$ insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'urgente', 1, 1) $$,
  '23505', null, 'prioridade padrão entra uma vez por tenant');
select throws_ok(
  $$ insert into app.prioridade (id, tenant_id, ordem, peso) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 1, 1001) $$,
  '23514', null, 'peso de 1 a 1000');
select throws_ok(
  $$ insert into app.prioridade (id, tenant_id, nomes, ordem, peso) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '[]', 1, 1) $$,
  '23514', null, 'nomes da prioridade como objeto');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.situacao', 'sem contexto: nenhuma situação');
select is_empty('select 1 from app.prioridade', 'sem contexto: nenhuma prioridade');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select (select count(*) from app.situacao where tenant_id = '10000000-0000-0000-0000-000000000000')::int
                          + (select count(*) from app.prioridade where tenant_id = '10000000-0000-0000-0000-000000000000')::int $$,
  $$ values (0) $$, 'admin B não vê situações nem prioridades do A');
select is_empty($$ update app.situacao set ativa = false where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera situação do A');
select is_empty($$ update app.prioridade set ativa = false where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$,
  'admin B não altera prioridade do A');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, nomes, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'pausada', '{"pt-BR": "x"}', 1, '#000000') $$,
  '42501', null, 'admin B não cria situação no A');
select throws_ok(
  $$ insert into app.prioridade (id, tenant_id, nomes, ordem, peso) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}', 1, 1) $$,
  '42501', null, 'admin B não cria prioridade no A');

-- Caso 2 — gerente do Hotel 1: lê as do tenant, não grava
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.situacao $$, $$ values (2) $$, 'gerente lê as situações do tenant');
select results_eq($$ select count(*)::int from app.prioridade $$, $$ values (2) $$, 'gerente lê as prioridades do tenant');
select throws_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, nomes, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'pausada', '{"pt-BR": "x"}', 1, '#000000') $$,
  '42501', null, 'gerente não cria situação');
select throws_ok(
  $$ insert into app.prioridade (id, tenant_id, nomes, ordem, peso) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '{"pt-BR": "x"}', 1, 1) $$,
  '42501', null, 'gerente não cria prioridade');
select is_empty($$ update app.situacao set ordem = 2 returning 1 $$, 'gerente não altera situação');
select is_empty($$ update app.prioridade set peso = 2 returning 1 $$, 'gerente não altera prioridade');

-- Caso 3 — proprietários leem, não gravam
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select (select count(*) from app.situacao)::int + (select count(*) from app.prioridade)::int $$,
  $$ values (4) $$, 'dono de UH lê as situações e prioridades do tenant');
select is_empty($$ update app.prioridade set ativa = false returning 1 $$, 'dono de UH não altera prioridade');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select (select count(*) from app.situacao)::int + (select count(*) from app.prioridade)::int $$,
  $$ values (4) $$, 'dono de hotel inteiro, sem locais, lê as situações e prioridades');
select is_empty($$ update app.situacao set ativa = false returning 1 $$, 'dono de hotel inteiro não altera situação');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty($$ select 1 from app.situacao union all select 1 from app.prioridade $$,
  'implantador vencido não vê situação nem prioridade');

-- Admin A: cria e altera; entidade, estado e chave padrão fixos; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select lives_ok(
  $$ insert into app.situacao (id, tenant_id, entidade, estado, nomes, ordem, cor) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'os', 'pausada', '{"pt-BR": "Aguardando cliente"}', 45, '#6b7280') $$,
  'admin cria situação');
select isnt_empty($$ update app.prioridade set peso = 90, ordem = 15
                     where id = '9a000000-0000-0000-0000-000000000002' returning 1 $$, 'admin altera peso e ordem');
select throws_ok($$ update app.situacao set estado = 'pausada' $$, '42501', null,
  'o estado da situação não é alterável');
select throws_ok($$ update app.situacao set entidade = 'os' $$, '42501', null,
  'a entidade da situação não é alterável');
select throws_ok($$ update app.prioridade set chave_padrao = 'alta' $$, '42501', null,
  'a chave padrão não é alterável');
select throws_ok($$ delete from app.situacao $$, '42501', null, 'sem DELETE em situação');
select throws_ok($$ delete from app.prioridade $$, '42501', null, 'sem DELETE em prioridade');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(distinct tenant_id)::int from
                     (select tenant_id from app.situacao union all select tenant_id from app.prioridade) t $$,
  $$ values (1) $$, 'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
