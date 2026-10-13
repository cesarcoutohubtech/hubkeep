-- ============================================================================
-- Isolamento do feriado do hotel e das colunas novas do SLA (migração 0043,
-- fase 1c; ADR-042). Os seis casos mínimos do doc 02 para app.feriado_hotel:
--   1. admin de outro tenant não vê, não grava nem altera;
--   2. a gestão do hotel e o Implantador cadastram e alteram, em nome deles
--      mesmos, só nos hotéis deles; o técnico e o solicitante leem (a
--      abertura do chamado calcula o prazo com o contexto de quem abre), mas
--      não gravam;
--   3. o proprietário não vê nem grava: o feriado é configuração do hotel, e
--      não dado da UH dele (o prazo ele vê no próprio chamado);
--   4. técnico de outro hotel não vê nem grava;
--   5. sem contexto, nada;
--   6. FK composta: o feriado só existe no hotel do tenant e com usuário do
--      tenant; a categoria do chamado é do grupo do chamado.
-- E o implantador vencido do Hotel 1, que não vê nem grava (B2 do docs/11).
-- Mais: nome preenchido; um feriado ativo por data no hotel, e o desativado
-- não conta; sem UPDATE na data, no hotel e em quem criou; sem DELETE;
-- worker vê só o tenant do job.
-- Chamado: categoria, prazos e tempo pausado nascem vazios; tempo pausado não
-- negativo; a triagem grava a categoria e os prazos; o Técnico responsável
-- grava o prazo e o tempo pausado na retomada; o proprietário e o admin de
-- outro tenant, não; a cópia da política continua sem UPDATE.
-- Transição: o motivo da pausa só na lista do domínio e só na ação pausar.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(49);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'implantador@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'proprietario@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'tecnico-h2@a.test'),
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() + interval '30 days', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.categoria_ativo (id, tenant_id, chave_padrao, nomes) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'refrigeracao', '{}'),
  ('ca000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Pintura"}'),
  ('cab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Categoria B"}');
insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'em_execucao', 'os_em_execucao', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'em_execucao', 'chamado_em_execucao', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1 (Hotel 1, UH 101, OS do técnico), c5 (Hotel 2), cb (tenant B).
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por)
select c.id::uuid, c.tenant::uuid, c.hotel::uuid, c.local::uuid, c.descricao, c.descricao, 'em_execucao', c.situacao::uuid,
       c.prioridade::uuid, '{}', c.aberto_por::uuid
from (values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001', 'parede descascando', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001', 'porta', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001', 'chamado b', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')
) as c (id, tenant, hotel, local, descricao, situacao, prioridade, aberto_por);
insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, chamado_aberto_por, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'em_execucao', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002');
-- Feriados: f1 (Hotel 1), f2 (Hotel 2), fb (tenant B).
insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, anual, criado_por) values
  ('fe100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '2026-09-08', 'Aniversário da cidade', true, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('fe200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '2026-10-24', 'Aniversário de Manaus', true, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('feb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '2026-12-24', 'Véspera de Natal', false, 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             '2026-11-02', 'Finados', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23503', null, 'feriado em hotel de outro tenant');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-02', 'Finados', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'feriado cadastrado por usuário de outro tenant');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-02', '   ', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23514', null, 'feriado sem nome');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-09-08', 'Outro nome', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', null, 'um feriado ativo por data no hotel');
select lives_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, ativo, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-09-08', 'Desativado', false, 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'o feriado desativado não conflita com o ativo da mesma data');
select results_eq(
  $$ select categoria_id is null, prazo_atendimento is null, prazo_solucao is null, pausado_segundos
     from app.chamado where id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ values (true, true, true, 0) $$, 'chamado nasce sem categoria, sem prazos e sem tempo pausado');
select throws_ok(
  $$ update app.chamado set categoria_id = 'cab00000-0000-0000-0000-000000000001'
     where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'categoria de outro tenant no chamado');
select throws_ok(
  $$ update app.chamado set pausado_segundos = -1 where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'tempo pausado negativo');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'almoco', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'motivo da pausa fora da lista do domínio');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'concluir', 'em_execucao', 'concluida', 'aguardando_peca', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'motivo só na ação pausar');
select ok(
  not has_column_privilege('hk_app', 'app.feriado_hotel', 'data', 'UPDATE')
  and not has_column_privilege('hk_app', 'app.feriado_hotel', 'hotel_id', 'UPDATE')
  and not has_column_privilege('hk_app', 'app.feriado_hotel', 'criado_por', 'UPDATE')
  and not has_any_column_privilege('hk_worker', 'app.feriado_hotel', 'UPDATE'),
  'sem UPDATE na data, no hotel e em quem cadastrou; o worker só lê');
select ok(
  has_column_privilege('hk_app', 'app.chamado', 'categoria_id', 'UPDATE')
  and has_column_privilege('hk_app', 'app.chamado', 'prazo_atendimento', 'UPDATE')
  and has_column_privilege('hk_app', 'app.chamado', 'prazo_solucao', 'UPDATE')
  and has_column_privilege('hk_app', 'app.chamado', 'pausado_segundos', 'UPDATE')
  and not has_column_privilege('hk_app', 'app.chamado', 'politica_aplicada', 'UPDATE'),
  'UPDATE nas colunas novas do chamado; a cópia da política continua sem UPDATE');

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.feriado_hotel', 'sem contexto: nenhum feriado');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.feriado_hotel where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'admin B não vê feriados do A');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-02', 'Finados', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não cadastra feriado no A');
select is_empty($$ update app.feriado_hotel set nome = 'invadido'
  where id = 'fe100000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não altera feriado do A');
select is_empty($$ update app.chamado set prazo_solucao = now()
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'admin B não grava prazo em chamado do A');

-- Caso 2 — gerente do Hotel 1: cadastra e altera no hotel dele; a triagem grava a categoria e os prazos
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select isnt_empty($$ select 1 from app.feriado_hotel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'gerente vê os feriados do hotel dele');
select results_eq($$ select count(*)::int from app.feriado_hotel where hotel_id = '11100000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$, 'gerente do Hotel 1 não vê feriado do Hotel 2');
select lives_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values ('fe100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-02', 'Finados', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente cadastra feriado no hotel dele, em nome dele');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente do Hotel 1 não cadastra feriado no Hotel 2');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não cadastra em nome de outro');
select isnt_empty($$ update app.feriado_hotel set nome = 'Aniversário do município', anual = true, atualizado_em = now()
  where id = 'fe100000-0000-0000-0000-000000000001' returning 1 $$, 'gerente altera feriado do hotel dele');
select is_empty($$ update app.feriado_hotel set nome = 'invadido'
  where id = 'fe200000-0000-0000-0000-000000000001' returning 1 $$, 'gerente do Hotel 1 não altera feriado do Hotel 2');
select throws_ok(
  $$ update app.feriado_hotel set data = '2026-09-09' where id = 'fe100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'sem UPDATE na data do feriado');
select isnt_empty($$ update app.chamado set categoria_id = 'ca000000-0000-0000-0000-000000000002',
    prazo_atendimento = now() + interval '8 hours', prazo_solucao = now() + interval '24 hours'
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'a triagem grava a categoria e os prazos');

-- Caso 2 — implantador vigente do Hotel 1 cadastra na implantação
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select lives_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-01-20', 'São Sebastião', 'aaaaaaaa-0000-0000-0000-000000000003') $$,
  'implantador cadastra feriado do hotel dele');

-- Caso 2 — técnico responsável pela OS do c1: lê, não cadastra; pausa com motivo e grava a retomada
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select isnt_empty($$ select 1 from app.feriado_hotel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'técnico lê os feriados do hotel (cálculo do prazo)');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não cadastra feriado');
select is_empty($$ update app.feriado_hotel set ativo = false
  where id = 'fe100000-0000-0000-0000-000000000001' returning 1 $$, 'técnico não desativa feriado');
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', 'aguardando_peca', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'técnico pausa com o motivo, em nome dele');
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, motivo_pausa, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '0a100000-0000-0000-0000-000000000001',
             'pausar', 'em_execucao', 'pausada', null, 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'pausa sem motivo (operação offline anterior) é aceita');
select isnt_empty($$ update app.chamado set prazo_solucao = now() + interval '25 hours', pausado_segundos = 3600
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'responsável grava o prazo e o tempo pausado na retomada');

-- Caso 2 — solicitante do Hotel 1: lê (abre chamado), não cadastra
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select isnt_empty($$ select 1 from app.feriado_hotel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  'solicitante lê os feriados do hotel (cálculo na abertura)');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000009') $$,
  '42501', null, 'solicitante não cadastra feriado');

-- Caso 4 — técnico do Hotel 2
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select count(*)::int from app.feriado_hotel where hotel_id = '11100000-0000-0000-0000-000000000001' $$,
  $$ values (0) $$, 'técnico do Hotel 2 não vê feriado do Hotel 1');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000007') $$,
  '42501', null, 'técnico do Hotel 2 não cadastra no Hotel 1');

-- Implantador vencido do Hotel 1 (B2 do docs/11)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ select 1 from app.feriado_hotel $$, 'implantador vencido não vê feriado');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000008') $$,
  '42501', null, 'implantador vencido não cadastra feriado');

-- Caso 3 — proprietário da UH 101
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select is_empty($$ select 1 from app.feriado_hotel $$, 'proprietário não vê feriado do hotel');
select throws_ok(
  $$ insert into app.feriado_hotel (id, tenant_id, hotel_id, data, nome, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '2026-11-03', 'Ponte', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'proprietário não cadastra feriado');
select results_eq(
  $$ select prazo_solucao is not null, pausado_segundos from app.chamado where id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ values (true, 3600) $$, 'proprietário vê o prazo e o tempo pausado no chamado da UH dele');
select is_empty($$ update app.chamado set categoria_id = 'ca000000-0000-0000-0000-000000000001'
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'proprietário não muda a categoria do chamado');

-- Admin A: vê os feriados dos dois hotéis, sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(distinct hotel_id)::int from app.feriado_hotel $$, $$ values (2) $$,
  'admin A vê os feriados dos dois hotéis do tenant');
select isnt_empty($$ update app.feriado_hotel set ativo = false, atualizado_em = now()
  where id = 'fe200000-0000-0000-0000-000000000001' returning 1 $$, 'admin A desativa feriado (exclusão lógica)');
select throws_ok($$ delete from app.feriado_hotel $$, '42501', null, 'sem DELETE em feriado');
reset role;

-- Worker vê só o tenant do job e lê os prazos (monitor de SLA)
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.feriado_hotel', $$ values (1) $$,
  'worker vê só o tenant do job');
select results_eq(
  $$ select categoria_id::text, prazo_solucao is not null from app.chamado where id = 'c1000000-0000-0000-0000-000000000001' $$,
  $$ values ('ca000000-0000-0000-0000-000000000002', true) $$,
  'worker lê a categoria e o prazo do chamado');
select results_eq(
  $$ select count(*)::int from app.os_transicao where motivo_pausa = 'aguardando_peca' $$,
  $$ values (1) $$, 'worker lê o motivo da pausa');
reset role;

select * from finish();
rollback;
