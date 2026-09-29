-- ============================================================================
-- Isolamento de app.os e UPDATE da triagem em app.chamado (migração 0022,
-- fase 1a C3; ADR-027, ADR-029): os seis casos mínimos do doc 02.
--   1. admin de outro tenant não vê, não gera e não altera OS;
--   2. gerente de um hotel gera, reatribui e ajusta a prioridade só no hotel
--      dele e em nome dele; o técnico e o solicitante não alteram nada;
--   3. proprietário vê a OS do chamado que ele vê, e não grava;
--   4. implantador vencido não vê nada;
--   5. sem contexto, nada;
--   6. FK composta rejeita chamado, equipe, técnico, situação e autor de
--      outro hotel ou tenant.
-- Mais: um responsável só; motivo; no máximo uma OS não cancelada por
-- chamado, também na reativação (a reabertura usa a mesma OS); a triagem lê
-- a atribuição do Técnico só nos hotéis dela; sem DELETE; campos de escopo
-- sem UPDATE; worker vê só o tenant do job.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(44);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gestor-h2@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'implantador-vencido@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'dono-uh@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'dono-hotel@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'solicitante@a.test'),
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
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'gestor_csc', 'hotel', '11100000-0000-0000-0000-000000000002', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005', 'implantador', 'hotel', '11100000-0000-0000-0000-000000000001', null, now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000006', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000007', 'proprietario', 'proprietario', null, '11200000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000008', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.equipe (id, tenant_id, hotel_id, nome) values
  ('e1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'Manutenção H1'),
  ('e2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'Manutenção H2');

insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'chamado', 'aberto', 'chamado_aberto', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10),
  ('9a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'alta', 20, 30),
  ('9b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'Frigobar não gela', 'frigobar nao gela', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
   'Chuveiro frio', 'chuveiro frio', 'em_triagem', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', '11120000-0000-0000-0000-000000000001',
   'Porta do lobby', 'porta do lobby', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', '11130000-0000-0000-0000-000000000001',
   'Caldeira com ruído', 'caldeira com ruido', 'em_execucao', '5a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cb000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'Chamado B', 'chamado b', 'em_execucao', '5b000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', '{}', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, equipe_id, criado_por) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('0a200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', null, 'e2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0a300000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', '11130000-0000-0000-0000-000000000001',
   'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('0b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
   'atribuida', '5b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', null, 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 6 — FK composta e checks (como postgres)
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, equipe_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'equipe de outro hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'chamado de outro hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000001',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'OS com local diferente do do chamado (0024)');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'técnico de outro tenant');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5b000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23503', null, 'situação de outro tenant');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null, 'autor precisa ser membro do tenant');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'OS sem responsável');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, equipe_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23514', null, 'OS com técnico e equipe ao mesmo tempo');
select throws_ok(
  $$ update app.os set motivo_cancelamento = '   ' where id = '0a100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'motivo da OS em branco');
select throws_ok(
  $$ update app.chamado set motivo_cancelamento = repeat('x', 501) where id = 'c1000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'motivo do chamado acima de 500');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', null, 'segunda OS não cancelada no mesmo chamado');
select lives_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
     values ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'Técnico de férias', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'OS cancelada não conta: convive com a OS em andamento do chamado');
update app.os set estado = 'concluida' where id = '0a100000-0000-0000-0000-000000000001';
select lives_ok(
  $$ update app.os set estado = 'em_execucao' where id = '0a100000-0000-0000-0000-000000000001' $$,
  'aceite recusado reabre a mesma OS');
select throws_ok(
  $$ update app.os set estado = 'atribuida', motivo_cancelamento = null where id = '0a100000-0000-0000-0000-000000000002' $$,
  '23505', null, 'OS cancelada não volta a valer com outra em andamento');
update app.os set estado = 'atribuida' where id = '0a100000-0000-0000-0000-000000000001';

set local role hk_app;

-- Caso 5 — sem contexto
select from (select set_config('app.usuario_id', '', true), set_config('app.tenant_id', '', true)) ctx;
select is_empty('select 1 from app.os', 'sem contexto: nenhuma OS');

-- Caso 1 — admin B
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
       set_config('app.tenant_id',  '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select count(*)::int from app.os where tenant_id = '10000000-0000-0000-0000-000000000000' $$, $$ values (0) $$,
  'admin B não vê OS do A');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin B não gera OS no A');
select is_empty($$ update app.os set versao = versao + 1
  where tenant_id = '10000000-0000-0000-0000-000000000000' returning 1 $$, 'admin B não altera OS do A');

-- Caso 2 — gerente do Hotel 1
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
       set_config('app.tenant_id',  '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq($$ select id::text from app.os order by id $$,
  $$ values ('0a100000-0000-0000-0000-000000000001'), ('0a100000-0000-0000-0000-000000000002') $$,
  'gerente vê só as OS do Hotel 1');
select lives_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, equipe_id, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', '11110000-0000-0000-0000-000000000002',
             'atribuida', '5a000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  'gerente gera OS no Hotel 1, para a equipe do hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, equipe_id, motivo_cancelamento, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
             'cancelada', '5a000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'x', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'gerente não gera OS em outro hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'gerente não gera OS em nome de outro');
select isnt_empty($$ update app.os set tecnico_id = null, equipe_id = 'e1000000-0000-0000-0000-000000000001', versao = versao + 1
  where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$, 'gerente reatribui a OS do Hotel 1 para a equipe');
select isnt_empty($$ update app.chamado set prioridade_id = '9a000000-0000-0000-0000-000000000002', versao = versao + 1
  where id = 'c1000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente ajusta a prioridade do chamado do Hotel 1');
select is_empty($$ update app.chamado set prioridade_id = '9a000000-0000-0000-0000-000000000002'
  where id = 'c2000000-0000-0000-0000-000000000001' returning 1 $$, 'gerente não altera chamado de outro hotel');
select throws_ok($$ update app.os set hotel_id = hotel_id $$, '42501', null, 'hotel_id da OS sem UPDATE');
select throws_ok($$ update app.chamado set descricao = 'x' $$, '42501', null, 'descrição do chamado sem UPDATE');
select results_eq($$ select usuario_id::text from app.atribuicao_escopo where papel = 'tecnico' $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000004') $$, 'gerente lê a atribuição do Técnico do Hotel 1, para atribuir a OS');
select is_empty($$ select 1 from app.atribuicao_escopo
  where papel <> 'tecnico' and usuario_id <> 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  'gerente não lê as atribuições de outros papéis');

-- Gestor CSC do Hotel 2: só no hotel dele
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000003', true)) ctx;
select isnt_empty($$ update app.os set estado = 'cancelada', motivo_cancelamento = 'Duplicada'
  where id = '0a200000-0000-0000-0000-000000000001' returning 1 $$, 'gestor CSC cancela a OS do Hotel 2');
select is_empty($$ update app.os set versao = versao + 1
  where hotel_id = '11100000-0000-0000-0000-000000000001' returning 1 $$, 'gestor CSC não altera OS do Hotel 1');
select is_empty($$ select 1 from app.atribuicao_escopo where papel = 'tecnico' $$,
  'gestor CSC do Hotel 2 não lê a atribuição do Técnico do Hotel 1');

-- Técnico e solicitante do Hotel 1: leem, não gravam (a C4 dá ao responsável o que é dele)
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq($$ select count(*)::int from app.os $$, $$ values (3) $$, 'técnico vê as OS do Hotel 1');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'técnico não gera OS');
select is_empty($$ update app.os set versao = versao + 1 where id = '0a100000-0000-0000-0000-000000000001' returning 1 $$,
  'técnico não altera a OS da equipe de que não é membro (a C4 dá ao responsável o que é dele)');
select is_empty($$ update app.chamado set versao = versao + 1 returning 1 $$, 'técnico não altera chamado');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000008', true)) ctx;
select is_empty($$ update app.chamado set prioridade_id = '9a000000-0000-0000-0000-000000000002' returning 1 $$,
  'solicitante não ajusta a prioridade');

-- Caso 3 — proprietários
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000006', true)) ctx;
select results_eq($$ select distinct chamado_id::text from app.os $$,
  $$ values ('c1000000-0000-0000-0000-000000000001') $$, 'dono de UH vê só as OS do chamado da UH dele');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, chamado_id, local_id, estado, situacao_id, tecnico_id, motivo_cancelamento, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
             'cancelada', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', 'x', 'aaaaaaaa-0000-0000-0000-000000000006') $$,
  '42501', null, 'dono de UH não gera OS');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000007', true)) ctx;
select results_eq($$ select id::text from app.os $$,
  $$ values ('0a300000-0000-0000-0000-000000000001') $$, 'dono do hotel inteiro vê as OS do hotel dele');

-- Caso 4 — implantador vencido
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000005', true)) ctx;
select is_empty('select 1 from app.os', 'implantador vencido não vê OS');

-- Admin A: vê todas do tenant; sem DELETE
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000001', true)) ctx;
select results_eq($$ select count(*)::int from app.os $$, $$ values (5) $$, 'admin vê as OS do tenant');
select throws_ok($$ delete from app.os $$, '42501', null, 'sem DELETE em OS');
reset role;

-- Worker vê só o tenant do job
set local role hk_worker;
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq('select count(distinct tenant_id)::int from app.os', $$ values (1) $$,
  'worker vê só o tenant do job');
reset role;

select * from finish();
rollback;
