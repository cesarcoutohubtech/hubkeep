-- ============================================================================
-- A OS preventiva (migração 0048, fase 1b, PV3; ADR-041): a estrutura da OS
-- sem chamado e o que o hk_worker passa a gravar, e só isso.
--   1. um tipo só: a corretiva com chamado e autor, sem as colunas da
--      preventiva; a preventiva sem chamado nem "quem abriu", com o plano, o
--      ativo, a data prevista e a cópia do plano (objeto);
--   2. FK composta pelo hotel: o plano, o ativo e o local só do próprio hotel;
--   3. o índice único (plano, ativo, data prevista) recusa a mesma ocorrência,
--      inclusive depois de cancelada;
--   4. o worker grava a preventiva sem autor, no tenant do job, com a marca do
--      arrendado; sem contexto, em outro tenant, com autor ou sem plano, não;
--   5. o worker grava a transição gerar e a cópia do checklist sem autor, no
--      tenant do job, e nenhuma outra transição sem autor;
--   6. o hk_app segue gerando só a corretiva e não grava transição sem autor;
--      quem lê o hotel lê a preventiva, a gestão e o Técnico responsável a
--      alteram, e o Solicitante não (a preventiva não tem "quem abriu");
--      outro tenant não vê.
-- Os casos de isolamento da OS seguem no 018, os da transição no 025, os do
-- checklist no 034 e os do aceite automático no 038.
-- ============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(32);

grant usage on schema extensions to hk_app, hk_worker;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente@a.test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'tecnico@a.test'),
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
insert into app.atribuicao_escopo (id, tenant_id, usuario_id, papel, escopo_tipo, hotel_id, proprietario_id, valido_ate, concedido_por) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'gerente_hotel', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004', 'tecnico', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000009', 'solicitante', 'hotel', '11100000-0000-0000-0000-000000000001', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin_grupo', 'grupo', null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.categoria_ativo (id, tenant_id, chave_padrao) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ar_condicionado'),
  ('cb000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000000', 'ar_condicionado');
insert into app.ativo (codigo_qr, id, tenant_id, hotel_id, local_id, categoria_id, nome, busca) values
  ('Q000000001', 'a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 101', 'split uh 101'),
  ('Q000000002', 'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   '11120000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Split UH 201', 'split uh 201'),
  ('Q000000003', 'ab000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-00000000000c', 'Split B', 'split b');
insert into app.checklist_modelo (id, tenant_id, categoria_id, nomes) values
  ('cc100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-000000000001',
   '{"pt-BR": "Inspeção de ar-condicionado"}'),
  ('ccb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', null, '{"pt-BR": "Modelo B"}');
-- Planos: p1 (Hotel 1, do ativo a1), p2 (Hotel 2, do ativo a2), pb (tenant B).
insert into app.plano_preventivo (id, tenant_id, hotel_id, ativo_id, nome, intervalo, unidade, inicio,
                                  checklist_modelo_id, tecnico_id, situacao, criado_por) values
  ('9e100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Limpeza do filtro', 1, 'mes', current_date - 60,
   'cc100000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'ativo', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('9e200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001', 'Limpeza do filtro H2', 1, 'mes', current_date - 60,
   null, 'aaaaaaaa-0000-0000-0000-000000000004', 'ativo', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('9eb00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000001', 'Plano B', 30, 'dia', current_date - 60,
   null, 'bbbbbbbb-0000-0000-0000-000000000001', 'ativo', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into app.situacao (id, tenant_id, entidade, estado, chave_padrao, ordem, cor) values
  ('5a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb'),
  ('5a000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', 'chamado', 'triagem', 'chamado_triagem', 10, '#2563eb'),
  ('5b000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', 'os', 'atribuida', 'os_atribuida', 10, '#2563eb');
insert into app.prioridade (id, tenant_id, chave_padrao, ordem, peso) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', 'baixa', 40, 10);
-- c1: um chamado do Hotel 1, ainda sem OS.
insert into app.chamado (id, tenant_id, hotel_id, local_id, descricao, busca, estado, situacao_id, prioridade_id, politica_aplicada, aberto_por) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', 'tomada 101', 'tomada 101', 'triagem', '5a000000-0000-0000-0000-000000000002',
   '9a000000-0000-0000-0000-000000000001', '{}', 'aaaaaaaa-0000-0000-0000-000000000009');
-- o1 (Hotel 1, p1, de 30 dias atrás, do técnico) e ob (tenant B): preventivas.
insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                    estado, situacao_id, tecnico_id) values
  ('0a100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   current_date - 30, '{"nome": "Limpeza do filtro", "versao": 1, "intervalo": 1, "unidade": "mes"}',
   'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('0ab00000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
   '22210000-0000-0000-0000-000000000001', '9eb00000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001',
   current_date, '{"nome": "Plano B", "versao": 1, "intervalo": 30, "unidade": "dia"}',
   'atribuida', '5b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Caso 1 — um tipo só (como postgres)
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, chamado_id, criado_por, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'a OS não é corretiva e preventiva ao mesmo tempo');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, plano_aplicado, estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'a preventiva tem data prevista');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, chamado_aberto_por, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000009', '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
      current_date, '{}', 'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'a preventiva não tem quem abriu');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, '[]',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'a cópia do plano é um objeto');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, chamado_id, chamado_aberto_por, estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23514', null, 'a corretiva tem quem a gerou');

-- Caso 2 — FK composta pelo hotel (como postgres)
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e200000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23503', null, 'o plano só do próprio hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', current_date, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23503', null, 'o ativo só do próprio hotel');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11120000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23503', null, 'o local só do próprio hotel');

-- Caso 3 — a mesma ocorrência não sai duas vezes (como postgres)
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date - 30, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23505', null, 'a mesma ocorrência do plano e do ativo não sai de novo');
update app.os set estado = 'cancelada' where id = '0a100000-0000-0000-0000-000000000001';
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date - 30, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '23505', null, 'a ocorrência cancelada não volta');
update app.os set estado = 'atribuida' where id = '0a100000-0000-0000-0000-000000000001';

set local role hk_worker;

-- Caso 4 — sem contexto, o worker não grava OS
select from (select set_config('app.tenant_id', '', true)) ctx;
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'sem contexto, o worker não gera OS');

-- Caso 4 — no tenant do job, a preventiva sem autor
select from (select set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select lives_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id, responsavel_arrendamento) values
     ('0a100000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
      '11110000-0000-0000-0000-000000000001', '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
      current_date, '{"nome": "Limpeza do filtro", "versao": 1, "intervalo": 1, "unidade": "mes"}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'locador') $$,
  'o worker gera a preventiva no tenant do job, com a marca do arrendado');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, chamado_id, chamado_aberto_por, criado_por, estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  '42501', null, 'o worker não gera corretiva');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date - 1, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'o worker não gera OS em nome de alguém');
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001', '22210000-0000-0000-0000-000000000001',
      '9eb00000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', current_date - 1, '{}',
      'atribuida', '5b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '42501', null, 'o worker não gera OS de outro tenant');

-- Caso 5 — a transição gerar e a cópia do checklist, sem autor
select lives_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000002', 'gerar', null, 'atribuida') $$,
  'o worker grava a transição gerar sem usuário');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000002', 'iniciar', 'atribuida', 'em_execucao') $$,
  '42501', null, 'o worker não grava outra transição sem usuário');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para, usuario_id)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000002', 'gerar', null, 'atribuida', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'o worker não grava a geração em nome de alguém');
select lives_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000001', 1,
             '{"pt-BR": "Inspeção de ar-condicionado"}', '[]') $$,
  'o worker grava a cópia do checklist sem autor');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens, criado_por)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 1,
             '{"pt-BR": "Inspeção de ar-condicionado"}', '[]', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'o worker não grava checklist em nome de alguém');
select throws_ok(
  $$ insert into app.os_checklist (id, tenant_id, hotel_id, os_id, modelo_id, modelo_versao, nomes, itens)
     values (gen_random_uuid(), '20000000-0000-0000-0000-000000000000', '22200000-0000-0000-0000-000000000001',
             '0ab00000-0000-0000-0000-000000000001', 'ccb00000-0000-0000-0000-000000000001', 1,
             '{"pt-BR": "Modelo B"}', '[]') $$,
  '42501', null, 'o worker não grava checklist de outro tenant');
reset role;

-- Caso 6 — o hk_app: a gestão do hotel
set local role hk_app;
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000002', true),
                    set_config('app.tenant_id', '10000000-0000-0000-0000-000000000000', true)) ctx;
select throws_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, plano_id, ativo_id, data_prevista, plano_aplicado,
                         estado, situacao_id, tecnico_id, criado_por) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      '9e100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date - 2, '{}',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'o gerente não gera preventiva, nem em nome dele');
select throws_ok(
  $$ insert into app.os_transicao (id, tenant_id, hotel_id, os_id, acao, de, para)
     values (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001',
             '0a100000-0000-0000-0000-000000000001', 'gerar', null, 'atribuida') $$,
  '42501', null, 'o hk_app não grava a geração sem usuário');
select lives_ok(
  $$ insert into app.os (id, tenant_id, hotel_id, local_id, chamado_id, chamado_aberto_por, criado_por, estado, situacao_id, tecnico_id) values
     (gen_random_uuid(), '10000000-0000-0000-0000-000000000000', '11100000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
      'c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002',
      'atribuida', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004') $$,
  'o gerente segue gerando a corretiva');
select results_eq(
  $$ select count(*)::int from app.os where plano_id is not null $$,
  $$ values (2) $$, 'o gerente lê as preventivas do hotel dele');
select results_eq(
  $$ with u as (update app.os set estado = 'em_execucao', versao = versao + 1
                where id = '0a100000-0000-0000-0000-000000000002' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$, 'a gestão do hotel altera a preventiva');

-- Caso 6 — o Técnico responsável e o Solicitante
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000004', true)) ctx;
select results_eq(
  $$ select count(*)::int from app.os where id = '0a100000-0000-0000-0000-000000000001' $$,
  $$ values (1) $$, 'o técnico do hotel lê a preventiva');
select results_eq(
  $$ with u as (update app.os set estado = 'em_execucao', versao = versao + 1
                where id = '0a100000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (1) $$, 'o técnico responsável altera a preventiva');
select from (select set_config('app.usuario_id', 'aaaaaaaa-0000-0000-0000-000000000009', true)) ctx;
select results_eq(
  $$ with u as (update app.os set estado = 'pausada'
                where id = '0a100000-0000-0000-0000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'o solicitante não altera a preventiva: ela não tem quem abriu');

-- Caso 6 — outro tenant não vê
select from (select set_config('app.usuario_id', 'bbbbbbbb-0000-0000-0000-000000000001', true),
                    set_config('app.tenant_id', '20000000-0000-0000-0000-000000000000', true)) ctx;
select results_eq(
  $$ select count(*)::int from app.os where tenant_id = '10000000-0000-0000-0000-000000000000' $$,
  $$ values (0) $$, 'o admin de outro tenant não vê a preventiva');
reset role;

-- O que ficou gravado (como postgres)
select results_eq(
  $$ select criado_por, responsavel_arrendamento from app.os where id = '0a100000-0000-0000-0000-000000000002' $$,
  $$ values (null::uuid, 'locador'::text) $$,
  'a preventiva do worker sem autor, com a marca do arrendado');
select results_eq(
  $$ select acao, usuario_id from app.os_transicao where os_id = '0a100000-0000-0000-0000-000000000002' $$,
  $$ values ('gerar'::text, null::uuid) $$,
  'a transição gerar da preventiva, sem usuário');

select * from finish();
rollback;
